use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use png::{BitDepth, ColorType, Encoder};
use qrcodegen::{QrCode, QrCodeEcc};

const QUIET_ZONE: usize = 4;
const PIXELS_PER_MODULE: usize = 8;

pub fn write_qr_png(path: &Path, text: &str) -> Result<(), String> {
    let qr = QrCode::encode_text(text, QrCodeEcc::Medium)
        .map_err(|error| format!("QR encode failed: {error:?}"))?;
    let qr_size = qr.size() as usize;
    let image_size = (qr_size + QUIET_ZONE * 2) * PIXELS_PER_MODULE;
    let mut pixels = vec![255u8; image_size * image_size];

    for y in 0..qr_size {
        for x in 0..qr_size {
            if !qr.get_module(x as i32, y as i32) {
                continue;
            }

            let x0 = (x + QUIET_ZONE) * PIXELS_PER_MODULE;
            let y0 = (y + QUIET_ZONE) * PIXELS_PER_MODULE;
            for yy in y0..(y0 + PIXELS_PER_MODULE) {
                for xx in x0..(x0 + PIXELS_PER_MODULE) {
                    pixels[yy * image_size + xx] = 0;
                }
            }
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = File::create(path).map_err(|error| error.to_string())?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, image_size as u32, image_size as u32);
    encoder.set_color(ColorType::Grayscale);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder.write_header().map_err(|error| error.to_string())?;
    png_writer
        .write_image_data(&pixels)
        .map_err(|error| error.to_string())
}

pub fn png_file_to_data_url(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}
