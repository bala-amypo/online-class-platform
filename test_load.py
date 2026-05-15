import time
import argparse
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def run_test(num_tabs, room_id):
    print(f"🚀 Starting load test with {num_tabs} simulated users in room '{room_id}'...")
    
    # Configure Chrome to automatically allow camera/mic and use fake video/audio streams
    chrome_options = Options()
    chrome_options.add_argument("--use-fake-ui-for-media-stream") # Bypasses the camera permission popup
    chrome_options.add_argument("--use-fake-device-for-media-stream") # Feeds a fake video (green screen/spinner) instead of real webcam
    # chrome_options.add_argument("--headless") # Uncomment this to run it invisibly
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
    except Exception as e:
        print("❌ Failed to start Chrome WebDriver. Make sure Chrome is installed.")
        print(e)
        return
    
    base_url = f"http://localhost:3000/room/{room_id}"
    
    # Open the first tab
    driver.get(base_url)
    print("✅ Opened User 1")
    
    # Open additional tabs
    for i in range(1, num_tabs):
        time.sleep(1.5) # Stagger the joins slightly so the signaling server doesn't get flooded instantly
        driver.execute_script(f"window.open('{base_url}', '_blank');")
        print(f"✅ Opened User {i + 1}")
        
    print(f"\n🎉 All {num_tabs} simulated users have joined the room.")
    print("⏳ Leave this script running to keep the test active.")
    print("🛑 Press Ctrl+C in this terminal to stop the test and close all browser tabs.")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping test and closing browser...")
    finally:
        driver.quit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC Room Load Tester")
    parser.add_argument("--tabs", type=int, default=4, help="Number of tabs (users) to open")
    parser.add_argument("--room", type=str, default="test-room", help="Room ID to join")
    args = parser.parse_args()
    
    run_test(args.tabs, args.room)
