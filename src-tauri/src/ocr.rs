use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::ffi::c_void;

#[link(name = "Vision", kind = "framework")]
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

const K_CG_IMAGE_ALPHA_PREMULTIPLIED_LAST: u32 = 1;

#[cfg(target_os = "macos")]
pub fn ocr_rgba(width: u32, height: u32, rgba: &[u8]) -> Option<String> {
  if width < 8 || height < 8 || rgba.len() < (width as usize * height as usize * 4) {
    return None;
  }
  unsafe { vision_ocr(width as usize, height as usize, rgba) }
}

#[cfg(not(target_os = "macos"))]
pub fn ocr_rgba(_width: u32, _height: u32, _rgba: &[u8]) -> Option<String> {
  None
}

pub fn ocr_rgba_b64(width: u32, height: u32, b64: &str) -> Option<String> {
  let bytes = STANDARD.decode(b64).ok()?;
  ocr_rgba(width, height, &bytes)
}

#[tauri::command]
pub fn ocr_image(rgba: String, width: u32, height: u32) -> Option<String> {
  ocr_rgba_b64(width, height, &rgba)
}

#[cfg(target_os = "macos")]
unsafe fn vision_ocr(width: usize, height: usize, rgba: &[u8]) -> Option<String> {
  use objc2::msg_send;
  use objc2::runtime::{AnyClass, AnyObject};
  use std::ffi::CStr;

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

  let Some(req_cls) = AnyClass::get(c"VNRecognizeTextRequest") else {
    CGImageRelease(cg);
    return None;
  };
  let Some(handler_cls) = AnyClass::get(c"VNImageRequestHandler") else {
    CGImageRelease(cg);
    return None;
  };

  let request: *mut AnyObject = msg_send![req_cls, new];
  let _: () = msg_send![request, setRecognitionLevel: 1i64];
  let _: () = msg_send![request, setUsesLanguageCorrection: false];

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
  let mut lines: Vec<String> = Vec::new();
  for i in 0..n {
    let obs: *mut AnyObject = msg_send![results, objectAtIndex: i];
    let cands: *mut AnyObject = msg_send![obs, topCandidates: 1usize];
    if cands.is_null() {
      continue;
    }
    let first: *mut AnyObject = msg_send![cands, firstObject];
    if first.is_null() {
      continue;
    }
    let s: *mut AnyObject = msg_send![first, string];
    if s.is_null() {
      continue;
    }
    let utf8: *const i8 = msg_send![s, UTF8String];
    if utf8.is_null() {
      continue;
    }
    if let Ok(txt) = CStr::from_ptr(utf8).to_str() {
      let t = txt.trim();
      if !t.is_empty() {
        lines.push(t.to_string());
      }
    }
  }

  let _: () = msg_send![handler, release];
  let _: () = msg_send![request, release];

  if lines.is_empty() {
    None
  } else {
    Some(lines.join("\n"))
  }
}
