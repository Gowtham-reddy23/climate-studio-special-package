use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::ffi::c_void;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
  fn CGColorSpaceCreateDeviceRGB() -> *mut c_void;
  fn CGColorSpaceRelease(space: *mut c_void);
  fn CGBitmapContextCreate(
    data: *mut c_void,
    width: usize,
    height: usize,
    bits_per_component: usize,
    bytes_per_row: usize,
    space: *mut c_void,
    bitmap_info: u32,
  ) -> *mut c_void;
  fn CGBitmapContextCreateImage(ctx: *mut c_void) -> *mut c_void;
  fn CGContextRelease(ctx: *mut c_void);
  fn CGImageRelease(image: *mut c_void);
}

#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
  fn CVPixelBufferLockBaseAddress(pb: *mut c_void, flags: u64) -> i32;
  fn CVPixelBufferUnlockBaseAddress(pb: *mut c_void, flags: u64) -> i32;
  fn CVPixelBufferGetBaseAddress(pb: *mut c_void) -> *mut c_void;
  fn CVPixelBufferGetBytesPerRow(pb: *mut c_void) -> usize;
  fn CVPixelBufferGetWidth(pb: *mut c_void) -> usize;
  fn CVPixelBufferGetHeight(pb: *mut c_void) -> usize;
}

const K_CG_IMAGE_ALPHA_PREMULTIPLIED_LAST: u32 = 1;

#[derive(Serialize)]
pub struct CutoutResult {
  pub rgba: String,
  pub width: u32,
  pub height: u32,
}

#[cfg(target_os = "macos")]
pub fn remove_bg_rgba(width: u32, height: u32, rgba: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
  if width < 8 || height < 8 || rgba.len() < (width as usize * height as usize * 4) {
    return None;
  }
  unsafe { vision_remove_bg(width as usize, height as usize, rgba) }
}

#[cfg(not(target_os = "macos"))]
pub fn remove_bg_rgba(_width: u32, _height: u32, _rgba: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
  None
}

#[tauri::command]
pub fn remove_bg(rgba: String, width: u32, height: u32) -> Option<CutoutResult> {
  let bytes = STANDARD.decode(&rgba).ok()?;
  let (w, h, out) = remove_bg_rgba(width, height, &bytes)?;
  Some(CutoutResult {
    rgba: STANDARD.encode(&out),
    width: w,
    height: h,
  })
}

#[cfg(target_os = "macos")]
unsafe fn vision_remove_bg(width: usize, height: usize, rgba: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
  use objc2::msg_send;
  use objc2::runtime::{AnyClass, AnyObject};

  let mut pixels = rgba.to_vec();
  let space = CGColorSpaceCreateDeviceRGB();
  if space.is_null() {
    return None;
  }
  let ctx = CGBitmapContextCreate(
    pixels.as_mut_ptr() as *mut c_void,
    width,
    height,
    8,
    width * 4,
    space,
    K_CG_IMAGE_ALPHA_PREMULTIPLIED_LAST,
  );
  CGColorSpaceRelease(space);
  if ctx.is_null() {
    return None;
  }
  let cg = CGBitmapContextCreateImage(ctx);
  CGContextRelease(ctx);
  if cg.is_null() {
    return None;
  }

  // VNGenerateForegroundInstanceMaskRequest is macOS 14+.
  let Some(req_cls) = AnyClass::get(c"VNGenerateForegroundInstanceMaskRequest") else {
    CGImageRelease(cg);
    return None;
  };
  let Some(handler_cls) = AnyClass::get(c"VNImageRequestHandler") else {
    CGImageRelease(cg);
    return None;
  };

  let request: *mut AnyObject = msg_send![req_cls, new];
  let options: *mut AnyObject = msg_send![objc2::class!(NSDictionary), dictionary];
  let alloc: *mut AnyObject = msg_send![handler_cls, alloc];
  let handler: *mut AnyObject = msg_send![alloc, initWithCGImage: cg, options: options];
  CGImageRelease(cg);
  if handler.is_null() {
    let _: () = msg_send![request, release];
    return None;
  }

  let reqs: *mut AnyObject = msg_send![objc2::class!(NSArray), arrayWithObject: request];
  let mut err: *mut AnyObject = std::ptr::null_mut();
  let ok: bool = msg_send![handler, performRequests: reqs, error: &mut err];
  if !ok {
    let _: () = msg_send![handler, release];
    let _: () = msg_send![request, release];
    return None;
  }

  let results: *mut AnyObject = msg_send![request, results];
  let n: usize = if results.is_null() { 0 } else { msg_send![results, count] };
  if n == 0 {
    let _: () = msg_send![handler, release];
    let _: () = msg_send![request, release];
    return None;
  }

  let obs: *mut AnyObject = msg_send![results, objectAtIndex: 0usize];
  let instances: *mut AnyObject = msg_send![obs, allInstances];
  let count: usize = if instances.is_null() { 0 } else { msg_send![instances, count] };
  if count == 0 {
    let _: () = msg_send![handler, release];
    let _: () = msg_send![request, release];
    return None;
  }

  let mut mask_err: *mut AnyObject = std::ptr::null_mut();
  let pixel_buffer: *mut c_void = msg_send![
    obs,
    generateMaskedImageOfInstances: instances,
    fromRequestHandler: handler,
    croppedToInstancesExtent: false,
    error: &mut mask_err
  ];

  let _: () = msg_send![handler, release];
  let _: () = msg_send![request, release];

  if pixel_buffer.is_null() {
    return None;
  }

  // Read the CVPixelBuffer (BGRA) back to RGBA.
  CVPixelBufferLockBaseAddress(pixel_buffer, 1);
  let base = CVPixelBufferGetBaseAddress(pixel_buffer);
  let bpr = CVPixelBufferGetBytesPerRow(pixel_buffer);
  let out_w = CVPixelBufferGetWidth(pixel_buffer);
  let out_h = CVPixelBufferGetHeight(pixel_buffer);
  if base.is_null() || out_w == 0 || out_h == 0 {
    CVPixelBufferUnlockBaseAddress(pixel_buffer, 1);
    return None;
  }

  let mut out = vec![0u8; out_w * out_h * 4];
  let src = base as *const u8;
  for y in 0..out_h {
    for x in 0..out_w {
      let s = y * bpr + x * 4;
      let d = (y * out_w + x) * 4;
      // Source is BGRA; write RGBA.
      let b = *src.add(s);
      let g = *src.add(s + 1);
      let r = *src.add(s + 2);
      let a = *src.add(s + 3);
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
      out[d + 3] = a;
    }
  }
  CVPixelBufferUnlockBaseAddress(pixel_buffer, 1);

  Some((out_w as u32, out_h as u32, out))
}
