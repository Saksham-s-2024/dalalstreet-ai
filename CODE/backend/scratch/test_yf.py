import yfinance as yf
from datetime import datetime

def test_symbol(symbol):
    print(f"\n--- Testing {symbol} ---")
    t = yf.Ticker(symbol)
    
    print("Daily history (5d):")
    daily = t.history(period="5d", interval="1d")
    print(daily)
    
    print("\nIntraday history (1d, 1m):")
    intra = t.history(period="1d", interval="1m")
    print(intra.tail())

    if intra.empty:
        print("\nIntraday empty, searching back 7d (1m):")
        intra7 = t.history(period="7d", interval="1m")
        print(intra7.tail())

test_symbol("^NSEI")
test_symbol("RELIANCE.NS")
test_symbol("^BSESN")
