fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(code) = anchor_lib::run_cli(args) {
        std::process::exit(code);
    }
    anchor_lib::run()
}
