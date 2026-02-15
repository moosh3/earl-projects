# Polymarket BTC Trading Bot Assistant

A real-time console application for monitoring Polymarket BTC Up/Down markets (5-min and 15-min intervals) and identifying arbitrage opportunities against spot Bitcoin prices.

## Features

- **Real-time Monitoring**: Tracks Polymarket BTC 5-minute and 15-minute prediction markets
- **Live Price Feeds**: Fetches Bitcoin spot prices from Binance via WebSocket
- **Arbitrage Detection**: Identifies when Polymarket prices lag behind spot movements
- **Trading Signals**: Generates signals with confidence scores based on:
  - Price momentum (short-term trends)
  - Order book imbalance
  - Recent trade volume
  - Time until market resolution
- **Risk Management**: Position sizing, max exposure limits, stop-loss suggestions
- **Beautiful CLI**: Colored real-time output with tables and charts

## Installation

```bash
# Clone and navigate to the project
cd polymarket-btc-bot

# Install dependencies
pip install -r requirements.txt
```

## Usage

```bash
# Run the bot with default settings (monitors both 5m and 15m markets)
python bot.py

# Monitor only 5-minute markets
python bot.py --interval 5m

# Monitor only 15-minute markets
python bot.py --interval 15m

# Set custom risk parameters
python bot.py --max-exposure 1000 --risk-per-trade 0.02

# Enable verbose logging
python bot.py --verbose
```

## API Endpoints Used

### Polymarket APIs
- **Gamma API**: `https://gamma-api.polymarket.com/markets` - Market discovery
- **CLOB API**: `https://clob.polymarket.com` - Order book and pricing
  - `/price` - Current token prices
  - `/book` - Order book depth
  - `/midpoint` - Midpoint prices

### Binance API
- **WebSocket**: `wss://stream.binance.com:9443/ws/btcusdt@ticker` - Real-time BTC price
- **REST**: `https://api.binance.com/api/v3/ticker/24hr` - 24h statistics

## How It Works

1. **Market Discovery**: Calculates current 5m/15m window timestamps and fetches corresponding Polymarket BTC up/down markets
2. **Price Sync**: Maintains real-time connection to Binance for spot BTC price
3. **Analysis Engine**:
   - Compares Polymarket implied probability vs spot price trend
   - Analyzes order book depth for imbalance signals
   - Calculates momentum indicators
4. **Signal Generation**: Produces BUY/SELL/HOLD signals with confidence scores (0-100%)
5. **Risk Management**: Suggests position sizes based on volatility and account limits

## Configuration

Create a `.env` file for custom configuration:

```env
# Risk Parameters
MAX_EXPOSURE_USD=5000
RISK_PER_TRADE=0.02
MAX_POSITION_SIZE_USD=1000

# Trading Thresholds
ARBITRAGE_THRESHOLD=0.05
MIN_CONFIDENCE=60

# Update Intervals
REFRESH_INTERVAL_MS=1000
```

## Market Structure

Polymarket BTC up/down markets follow timestamp-based slugs:
- 5-minute: `btc-updown-5m-{timestamp}` (timestamp divisible by 300)
- 15-minute: `btc-updown-15m-{timestamp}` (timestamp divisible by 900)

Each market has two outcomes:
- **Yes**: BTC will be UP at resolution time
- **No**: BTC will be DOWN at resolution time

## Disclaimer

This tool is for informational purposes only. Trading prediction markets involves significant risk. Always do your own research and never trade more than you can afford to lose.

## License

MIT
