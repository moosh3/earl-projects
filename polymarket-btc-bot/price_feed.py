#!/usr/bin/env python3
"""
Multi-exchange price feed aggregator for BTC spot prices
Supports Binance, Coinbase, and CoinGecko as fallbacks
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable

import aiohttp
import websockets


@dataclass
class BTCPrice:
    """BTC spot price data"""
    price: float = 0.0
    change_24h: float = 0.0
    change_percent: float = 0.0
    high_24h: float = 0.0
    low_24h: float = 0.0
    volume: float = 0.0
    source: str = "unknown"
    last_update: float = 0.0


class PriceHistory:
    """Price history for momentum calculation"""
    
    def __init__(self, max_size: int = 100):
        self.prices: List[tuple] = []  # (timestamp, price)
        self.max_size = max_size
    
    def add(self, price: float):
        self.prices.append((time.time(), price))
        if len(self.prices) > self.max_size:
            self.prices = self.prices[-self.max_size:]
    
    def get_momentum(self, window_seconds: int = 60) -> float:
        """Calculate price momentum over window"""
        if len(self.prices) < 2:
            return 0.0
        cutoff = time.time() - window_seconds
        recent = [p for t, p in self.prices if t >= cutoff]
        if len(recent) < 2:
            return 0.0
        return (recent[-1] - recent[0]) / recent[0] * 100
    
    def get_average(self, window_seconds: int = 300) -> float:
        """Get average price over window"""
        cutoff = time.time() - window_seconds
        recent = [p for t, p in self.prices if t >= cutoff]
        if not recent:
            return 0.0
        return sum(recent) / len(recent)


class PriceFeedAggregator:
    """Aggregates BTC price from multiple exchanges"""
    
    def __init__(self, on_price_update: Optional[Callable] = None):
        self.price = BTCPrice()
        self.price_history = PriceHistory()
        self.on_price_update = on_price_update
        self.running = False
        self.tasks: List[asyncio.Task] = []
        self.sources_active: Dict[str, bool] = {}
        
    async def start(self):
        """Start all price feeds"""
        self.running = True
        self.tasks = [
            asyncio.create_task(self._binance_ws_loop()),
            asyncio.create_task(self._coinbase_rest_loop()),
            asyncio.create_task(self._coingecko_loop()),
        ]
        
    async def stop(self):
        """Stop all price feeds"""
        self.running = False
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        
    def _update_price(self, new_price: BTCPrice):
        """Update price with validation"""
        if new_price.price <= 0:
            return
            
        # Only update if price is reasonable (within 10% of current)
        if self.price.price > 0:
            change_pct = abs(new_price.price - self.price.price) / self.price.price
            if change_pct > 0.1:
                return  # Reject anomalous price
        
        self.price = new_price
        self.price_history.add(new_price.price)
        self.price.last_update = time.time()
        
        if self.on_price_update:
            self.on_price_update(self.price)
    
    async def _binance_ws_loop(self):
        """Binance WebSocket price feed"""
        uri = "wss://stream.binance.com:9443/ws/btcusdt@ticker"
        retry_delay = 1
        max_retry = 30
        
        while self.running:
            try:
                async with websockets.connect(uri, ping_interval=20) as ws:
                    self.sources_active['binance_ws'] = True
                    retry_delay = 1
                    
                    while self.running:
                        msg = await asyncio.wait_for(ws.recv(), timeout=30)
                        data = json.loads(msg)
                        
                        price = BTCPrice(
                            price=float(data.get('c', 0)),
                            change_24h=float(data.get('p', 0)),
                            change_percent=float(data.get('P', 0)),
                            high_24h=float(data.get('h', 0)),
                            low_24h=float(data.get('l', 0)),
                            volume=float(data.get('v', 0)),
                            source='binance_ws'
                        )
                        self._update_price(price)
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.sources_active['binance_ws'] = False
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_retry)
    
    async def _coinbase_rest_loop(self):
        """Coinbase REST API price feed"""
        url = "https://api.coinbase.com/v2/exchange-rates?currency=BTC"
        stats_url = "https://api.exchange.coinbase.com/products/BTC-USD/stats"
        retry_delay = 5
        
        while self.running:
            try:
                async with aiohttp.ClientSession() as session:
                    # Get current price
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            btc_price = float(data['data']['rates']['USD'])
                            
                            # Get 24h stats
                            stats_data = {}
                            try:
                                async with session.get(stats_url) as stats_resp:
                                    if stats_resp.status == 200:
                                        stats_data = await stats_resp.json()
                            except:
                                pass
                            
                            price = BTCPrice(
                                price=btc_price,
                                change_24h=float(stats_data.get('change', 0)),
                                change_percent=float(stats_data.get('change_percent', 0)),
                                high_24h=float(stats_data.get('high', 0)),
                                low_24h=float(stats_data.get('low', 0)),
                                volume=float(stats_data.get('volume', 0)),
                                source='coinbase'
                            )
                            self._update_price(price)
                            self.sources_active['coinbase'] = True
                        else:
                            self.sources_active['coinbase'] = False
                            
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.sources_active['coinbase'] = False
                
            await asyncio.sleep(retry_delay)
    
    async def _coingecko_loop(self):
        """CoinGecko API as final fallback"""
        url = "https://api.coingecko.com/api/v3/simple/price"
        params = {
            "ids": "bitcoin",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true",
            "include_24hr_high": "true",
            "include_24hr_low": "true"
        }
        retry_delay = 30  # CoinGecko rate limits
        
        while self.running:
            try:
                # Only use CoinGecko if other sources aren't working
                if self.price.last_update > time.time() - 60:
                    await asyncio.sleep(10)
                    continue
                    
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            btc = data.get('bitcoin', {})
                            
                            price = BTCPrice(
                                price=float(btc.get('usd', 0)),
                                change_percent=float(btc.get('usd_24h_change', 0)),
                                volume=float(btc.get('usd_24h_vol', 0)),
                                high_24h=float(btc.get('usd_24h_high', 0)),
                                low_24h=float(btc.get('usd_24h_low', 0)),
                                source='coingecko'
                            )
                            self._update_price(price)
                            self.sources_active['coingecko'] = True
                        else:
                            self.sources_active['coingecko'] = False
                            
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.sources_active['coingecko'] = False
                
            await asyncio.sleep(retry_delay)


# For testing
async def main():
    """Test the price feed aggregator"""
    def on_update(price: BTCPrice):
        print(f"\rSource: {price.source:12} | Price: ${price.price:>10,.2f} | "
              f"Change: {price.change_percent:>+6.2f}% | "
              f"High: ${price.high_24h:>9,.2f} | Low: ${price.low_24h:>9,.2f}", 
              end='', flush=True)
    
    aggregator = PriceFeedAggregator(on_price_update=on_update)
    await aggregator.start()
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        await aggregator.stop()


if __name__ == "__main__":
    asyncio.run(main())
