# Polymarket BTC Trading Bot Assistant - Build Summary

## What Was Built

A real-time Python CLI trading assistant that monitors Polymarket's BTC Up/Down prediction markets (5-minute and 15-minute intervals) and identifies arbitrage opportunities against live Bitcoin spot prices.

## Key Features

### 1. Multi-Source Price Feeds
- **Primary**: Binance WebSocket (real-time)
- **Fallback 1**: Coinbase REST API
- **Fallback 2**: CoinGecko API
- Automatic failover between sources for maximum uptime

### 2. Polymarket Integration
- **Gamma API**: Discovers active BTC up/down markets by timestamp
- **CLOB API**: Fetches order book depth, bid/ask prices, and token prices
- Automatically calculates current 5m/15m market windows

### 3. Signal Generation Algorithm
Trading signals are generated based on:
- **Momentum Analysis** (max 40% confidence): 1-minute price movement tracking
- **Order Book Imbalance** (max 25% confidence): Bid/ask pressure analysis
- **Arbitrage Detection** (30% confidence): Polymarket vs spot price divergence
- **Time Decay Factor** (10% confidence): Bonus near market resolution

### 4. Risk Management
- Maximum exposure limits per account
- Per-trade risk percentage (default: 2%)
- Position sizing based on confidence + time remaining
- Stop-loss suggestions (10% below entry)

### 5. Real-Time Console UI
- Live updating tables with Rich library
- Color-coded output (green=bullish, red=bearish, yellow=warning)
- Market countdown timers
- Signal history with confidence scores

## Project Structure

```
polymarket-btc-bot/
├── bot.py              # Main bot application
├── price_feed.py       # Multi-exchange price aggregator
├── test_apis.py        # API connectivity tester
├── requirements.txt    # Python dependencies
├── README.md           # Full documentation
├── QUICKSTART.md       # Quick start guide
├── .env.example        # Configuration template
└── .gitignore          # Git ignore rules
```

## How It Works

1. **Market Discovery**: Calculates Unix timestamps divisible by 300 (5m) or 900 (15m) to find active Polymarket BTC markets
2. **Price Aggregation**: Maintains redundant connections to multiple exchanges
3. **Signal Engine**: Calculates confidence scores from momentum, order book, and arbitrage signals
4. **Risk Check**: Validates signals against user-defined risk parameters
5. **Display**: Updates live console UI every 2 seconds (configurable)

## Usage

```bash
# Install dependencies
pip install -r requirements.txt

# Test API connectivity
python test_apis.py

# Run with defaults (monitors both 5m and 15m)
python bot.py

# Monitor 5m only with custom risk settings
python bot.py --interval 5m --max-exposure 10000 --risk-per-trade 0.03
```

## APIs Used

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Polymarket Gamma | `/markets` | Market discovery |
| Polymarket CLOB | `/price`, `/book` | Order book & pricing |
| Binance | `wss://stream.binance.com/...` | Real-time BTC price |
| Coinbase | `/v2/exchange-rates` | Price fallback |
| CoinGecko | `/api/v3/simple/price` | Final fallback |

## Technical Highlights

- **Async Architecture**: Uses `asyncio` for concurrent API calls and WebSocket connections
- **Resilient Design**: Multiple price sources with automatic failover
- **Modular Code**: Separate classes for each concern (price feeds, signals, risk, display)
- **Rich UI**: Terminal UI with live updates using the Rich library
- **Type Safety**: Dataclasses and type hints throughout

## Limitations & Notes

- No actual trading execution (informational tool only)
- Requires active Polymarket markets (markets may not exist between windows)
- WebSocket connections may be blocked in some regions (fallbacks handle this)
- Signals are algorithmic suggestions, not financial advice

## Repository

Pushed to: https://github.com/moosh3/earl-projects/tree/main/polymarket-btc-bot

## Future Enhancements

Potential improvements:
- Webhook/notification system for high-confidence signals
- Historical backtesting framework
- Actual trade execution via Polymarket CLOB API
- Machine learning signal refinement
- Support for ETH and other crypto markets
