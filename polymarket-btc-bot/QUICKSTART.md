# Polymarket BTC Trading Bot Assistant

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Test API connectivity
python test_apis.py

# 3. Run the bot
python bot.py

# 4. Monitor 5m markets only
python bot.py --interval 5m

# 5. Monitor 15m markets only
python bot.py --interval 15m
```

## Command Line Options

```
Usage: bot.py [OPTIONS]

Options:
  --interval [5m|15m|all]    Market interval to monitor (default: all)
  --max-exposure INTEGER     Maximum exposure in USD (default: 5000)
  --risk-per-trade FLOAT     Risk per trade as decimal (default: 0.02)
  --max-position INTEGER     Maximum position size in USD (default: 500)
  --arb-threshold FLOAT      Arbitrage detection threshold (default: 0.05)
  --min-confidence INTEGER   Minimum confidence threshold (default: 50)
  --update-interval INTEGER  Update interval in seconds (default: 2)
  --verbose                  Enable verbose output
  --help                     Show this message and exit
```

## Understanding the Output

### Header
- Current BTC price from Binance
- 24h change percentage
- 24h high/low prices
- Trading volume

### Markets Panel
- **Market**: 5m or 15m interval
- **Time Left**: Countdown to resolution
- **Yes/No Price**: Current Polymarket prices
- **Spread**: Bid-ask spread
- **OB Imbalance**: Order book imbalance (positive = bullish)

### Signals Panel
- Recent trading signals with:
  - Direction (UP/DOWN/NEUTRAL)
  - Confidence score (0-100%)
  - Reasoning (momentum, arbitrage, orderbook)

## Trading Signal Logic

### Confidence Score Components
1. **Momentum (max 40 pts)**: Based on 1-minute price movement
2. **Order Book Imbalance (max 25 pts)**: Asymmetry in bids/asks
3. **Arbitrage (30 pts)**: When Polymarket lags spot price
4. **Time Factor (10 pts)**: Bonus near resolution

### Signal Types
- **MOMENTUM**: Based on price trend
- **ORDERBOOK**: Based on bid/ask imbalance
- **ARBITRAGE**: Spot vs Polymarket mispricing
- **HOLD**: No clear signal

### Risk Management
- Position sizing based on confidence and time remaining
- Max exposure limits per market
- Stop-loss suggestions at 10% below entry

## Troubleshooting

### "No markets found"
- Check that it's during active trading hours
- Markets may be between windows (try again in a few minutes)
- Verify API connectivity with `python test_apis.py`

### "Waiting for BTC price"
- Binance WebSocket may be blocked by firewall
- Try using a VPN if in a restricted region

### High latency
- Reduce `--update-interval` for faster updates
- Check internet connection

## API Documentation

- [Polymarket Docs](https://docs.polymarket.com/)
- [Binance API](https://binance-docs.github.io/apidocs/spot/en/)

## License

MIT License - Use at your own risk.
