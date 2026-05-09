// Tiny smoke test: clears PATH down to the macOS-Finder default and
// confirms the resolver still finds sshuttle and reports a version.
// Run with: cargo run --example check_resolver

fn main() {
    // Mimic Finder/Dock's launch environment.
    std::env::set_var("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");

    println!("PATH = {}", std::env::var("PATH").unwrap_or_default());

    match sshuttle_ui_lib::sshuttle::find_sshuttle() {
        Some(p) => println!("found sshuttle at: {}", p.display()),
        None => {
            eprintln!("FAIL: resolver could not locate sshuttle");
            std::process::exit(1);
        }
    }

    let extended = sshuttle_ui_lib::sshuttle::extended_path();
    println!("extended PATH for child: {}", extended);
}
