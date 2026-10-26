use std::process::Command;

fn main() {
    // The decoy process is a tiny standalone exe compiled here and embedded in the app.
    let out = std::env::var("OUT_DIR").expect("OUT_DIR");
    let status = Command::new("rustc")
        .args(["stub/stub.rs", "--edition", "2021", "-O", "-C", "panic=abort", "-C", "strip=symbols", "-o"])
        .arg(format!("{out}/stub.exe"))
        .status()
        .expect("failed to run rustc for the stub");
    assert!(status.success(), "stub build failed");
    println!("cargo:rerun-if-changed=stub/stub.rs");
    tauri_build::build()
}
