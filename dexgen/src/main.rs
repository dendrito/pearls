use smali::dex::DexFile;
use smali::find_smali_files;
use std::env;
use std::error::Error;
use std::path::PathBuf;

// dexgen build <smali_dir> <out.dex>   -> assemble
// dexgen dump  <in.dex>                -> disassemble to stdout (round-trip check)
fn main() -> Result<(), Box<dyn Error>> {
    let a: Vec<String> = env::args().collect();
    match a.get(1).map(|s| s.as_str()) {
        Some("build") => {
            let mut classes = find_smali_files(&PathBuf::from(&a[2]))?;
            classes.sort_by(|x, y| x.name.as_jni_type().cmp(&y.name.as_jni_type()));
            let dex = DexFile::from_smali(&classes)?;
            dex.to_path(&a[3])?;
            println!("built {} classes -> {}", classes.len(), a[3]);
        }
        Some("dump") => {
            let bytes = std::fs::read(&a[2])?;
            let dex = DexFile::from_bytes(&bytes)?;
            for c in dex.to_smali()? {
                println!("{}", c.to_smali());
            }
        }
        _ => eprintln!("usage: dexgen build <dir> <out.dex> | dump <in.dex>"),
    }
    Ok(())
}
