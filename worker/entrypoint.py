"""Entry point ổn định cho worker được đóng gói bằng PyInstaller."""

from worker.server import run_server


if __name__ == "__main__":
    run_server()
