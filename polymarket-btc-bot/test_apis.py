#!/usr/bin/env python3
"""
Quick test script for API connectivity
Tests all price feed sources and Polymarket APIs
"""

import asyncio
import aiohttp
import time

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"


async def test_coinbase():
    """Test Coinbase API"""
    print("Testing Coinbase API...")
    url = "https://api.coinbase.com/v2/exchange-rates?currency=BTC"
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                price = float(data['data']['rates']['USD'])
                print(f"  ✓ BTC Price: ${price:,.2f}")
                return True
            else:
                print(f"  ✗ Failed: {resp.status}")
                return False


async def test_coingecko():
    """Test CoinGecko API"""
    print("\nTesting CoinGecko API...")
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": "bitcoin", "vs_currencies": "usd"}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status == 200:
                data = await resp.json()
                price = float(data['bitcoin']['usd'])
                print(f"  ✓ BTC Price: ${price:,.2f}")
                return True
            else:
                print(f"  ✗ Failed: {resp.status}")
                return False


async def test_binance():
    """Test Binance API"""
    print("\nTesting Binance API...")
    url = "https://api.binance.com/api/v3/ticker/price"
    params = {"symbol": "BTCUSDT"}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status == 200:
                data = await resp.json()
                print(f"  ✓ BTC Price: ${float(data['price']):,.2f}")
                return True
            elif resp.status == 451:
                print(f"  ⚠ Blocked in your region (451)")
                return False
            else:
                print(f"  ✗ Failed: {resp.status}")
                return False


async def test_polymarket_gamma():
    """Test Polymarket Gamma API"""
    print("\nTesting Polymarket Gamma API...")
    
    now = int(time.time())
    window_5m = now - (now % 300)
    slug = f"btc-updown-5m-{window_5m}"
    
    url = f"{GAMMA_API}/markets"
    params = {"slug": slug}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status == 200:
                data = await resp.json()
                if isinstance(data, list) and len(data) > 0:
                    market = data[0]
                    print(f"  ✓ Found market: {market.get('question', 'N/A')}")
                    print(f"    Slug: {slug}")
                    print(f"    Status: {'Active' if market.get('active') else 'Inactive'}")
                    return True
                else:
                    print(f"  ⚠ Market not found (may be between windows)")
                    return False
            else:
                print(f"  ✗ Failed: {resp.status}")
                return False


async def test_polymarket_clob():
    """Test Polymarket CLOB API"""
    print("\nTesting Polymarket CLOB API...")
    
    url = f"{CLOB_API}/price"
    params = {"token_id": "test"}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status in (200, 400, 404):
                print(f"  ✓ CLOB API reachable (status: {resp.status})")
                return True
            else:
                print(f"  ✗ Failed: {resp.status}")
                return False


async def test_price_feed():
    """Test the price feed aggregator"""
    print("\nTesting Price Feed Aggregator...")
    from price_feed import PriceFeedAggregator
    
    prices_received = []
    
    def on_price(price):
        prices_received.append((price.source, price.price))
        print(f"  → {price.source}: ${price.price:,.2f}")
    
    aggregator = PriceFeedAggregator(on_price_update=on_price)
    await aggregator.start()
    
    # Wait for prices from different sources
    await asyncio.sleep(5)
    await aggregator.stop()
    
    if prices_received:
        print(f"  ✓ Received {len(prices_received)} price updates")
        sources = set(p[0] for p in prices_received)
        print(f"    Sources: {', '.join(sources)}")
        return True
    else:
        print("  ✗ No prices received")
        return False


async def main():
    print("=" * 60)
    print("Polymarket BTC Bot - API Connectivity Test")
    print("=" * 60)
    print()
    
    results = []
    results.append(("Coinbase", await test_coinbase()))
    results.append(("CoinGecko", await test_coingecko()))
    results.append(("Binance", await test_binance()))
    results.append(("Polymarket Gamma", await test_polymarket_gamma()))
    results.append(("Polymarket CLOB", await test_polymarket_clob()))
    
    print("\n" + "=" * 60)
    print("Running Price Feed Test (5 seconds)...")
    print("=" * 60)
    results.append(("Price Feed Aggregator", await test_price_feed()))
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        color = "32" if passed else "31"
        print(f"\033[{color}m{status}\033[0m - {name}")
    
    print()
    critical = ["Coinbase", "CoinGecko", "Polymarket Gamma", "Polymarket CLOB"]
    critical_passed = all(r[1] for r in results if r[0] in critical)
    
    if critical_passed:
        print("✓ All critical APIs working! The bot should function correctly.")
        print("  (Binance being blocked is OK - Coinbase/CoinGecko are used as fallbacks)")
    else:
        print("✗ Some critical APIs failed. Check your internet connection.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTest cancelled.")
