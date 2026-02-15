#!/usr/bin/env python3
"""
Polymarket BTC Trading Bot Assistant
Real-time arbitrage detection for BTC 5m/15m prediction markets
"""

import asyncio
import json
import math
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from decimal import Decimal

import aiohttp
import click
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box

from price_feed import PriceFeedAggregator, BTCPrice, PriceHistory

# Configuration
GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"

console = Console()


@dataclass
class MarketData:
    """Represents a Polymarket BTC up/down market"""
    slug: str
    interval: str  # '5m' or '15m'
    window_start: int
    window_end: int
    token_id_yes: str
    token_id_no: str
    price_yes: float = 0.0
    price_no: float = 0.0
    bid_yes: float = 0.0
    ask_yes: float = 0.0
    bid_no: float = 0.0
    ask_no: float = 0.0
    volume: float = 0.0
    liquidity: float = 0.0
    last_update: float = 0.0


@dataclass
class Signal:
    """Trading signal with analysis"""
    market_slug: str
    direction: str  # 'UP', 'DOWN', 'NEUTRAL'
    confidence: int  # 0-100
    signal_type: str  # 'ARBITRAGE', 'MOMENTUM', 'ORDERBOOK', 'HOLD'
    reasoning: List[str]
    suggested_position_size: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    timestamp: float = field(default_factory=time.time)


class PolymarketClient:
    """Client for Polymarket Gamma and CLOB APIs"""

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.markets: Dict[str, MarketData] = {}

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def get_current_windows(self) -> Tuple[Tuple[int, int], Tuple[int, int]]:
        """Calculate current 5m and 15m window timestamps"""
        now = int(time.time())
        # 5-minute window (300 seconds)
        window_5m_start = now - (now % 300)
        window_5m_end = window_5m_start + 300
        # 15-minute window (900 seconds)
        window_15m_start = now - (now % 900)
        window_15m_end = window_15m_start + 900
        return (window_5m_start, window_5m_end), (window_15m_start, window_15m_end)

    async def fetch_market(self, slug: str) -> Optional[Dict]:
        """Fetch market data by slug"""
        url = f"{GAMMA_API}/markets"
        params = {"slug": slug}
        try:
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        return data[0]
                return None
        except Exception as e:
            console.print(f"[red]Error fetching market {slug}: {e}[/red]")
            return None

    async def fetch_clob_price(self, token_id: str) -> Optional[Dict]:
        """Fetch price from CLOB API"""
        url = f"{CLOB_API}/price"
        params = {"token_id": token_id}
        try:
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    return await resp.json()
                return None
        except Exception as e:
            return None

    async def fetch_order_book(self, token_id: str) -> Optional[Dict]:
        """Fetch order book from CLOB API"""
        url = f"{CLOB_API}/book"
        params = {"token_id": token_id}
        try:
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    return await resp.json()
                return None
        except Exception as e:
            return None

    async def update_market(self, market: MarketData) -> bool:
        """Update market data with latest prices"""
        # Fetch order books for both outcomes
        book_yes = await self.fetch_order_book(market.token_id_yes)
        book_no = await self.fetch_order_book(market.token_id_no)

        if book_yes:
            bids = book_yes.get("bids", [])
            asks = book_yes.get("asks", [])
            if bids:
                market.bid_yes = float(bids[0].get("price", 0))
            if asks:
                market.ask_yes = float(asks[0].get("price", 0))
            if market.bid_yes > 0 and market.ask_yes > 0:
                market.price_yes = (market.bid_yes + market.ask_yes) / 2

        if book_no:
            bids = book_no.get("bids", [])
            asks = book_no.get("asks", [])
            if bids:
                market.bid_no = float(bids[0].get("price", 0))
            if asks:
                market.ask_no = float(asks[0].get("price", 0))
            if market.bid_no > 0 and market.ask_no > 0:
                market.price_no = (market.bid_no + market.ask_no) / 2

        market.last_update = time.time()
        return True


class SignalEngine:
    """Generates trading signals from market data"""

    def __init__(self, config: Dict):
        self.config = config
        self.arb_threshold = config.get("arbitrage_threshold", 0.03)
        self.min_confidence = config.get("min_confidence", 50)

    def calculate_signal(
        self,
        market: MarketData,
        btc_price: BTCPrice,
        price_history: PriceHistory
    ) -> Signal:
        """Generate trading signal for a market"""
        reasoning = []
        scores = []

        # Time remaining analysis
        time_remaining = market.window_end - time.time()
        time_pct = time_remaining / (300 if market.interval == "5m" else 900)

        # Price momentum analysis
        momentum = price_history.get_momentum(60)
        momentum_score = min(abs(momentum) * 10, 40)  # Max 40 points
        if abs(momentum) > 0.1:
            scores.append(momentum_score)
            reasoning.append(f"Momentum: {momentum:+.3f}% (1m)")

        # Order book imbalance
        ob_imbalance = self._calc_ob_imbalance(market)
        if abs(ob_imbalance) > 0.1:
            ob_score = min(abs(ob_imbalance) * 30, 25)
            scores.append(ob_score)
            direction = "bullish" if ob_imbalance > 0 else "bearish"
            reasoning.append(f"OB Imbalance: {ob_imbalance:+.2f} ({direction})")

        # Polymarket vs Spot arbitrage
        arb_signal = self._calc_arbitrage(market, btc_price, momentum)
        if arb_signal:
            scores.append(30)
            reasoning.append(arb_signal)

        # Time decay factor
        if time_pct < 0.1:
            scores.append(10)
            reasoning.append(f"Resolution imminent ({time_remaining:.0f}s)")

        confidence = int(sum(scores))
        confidence = min(confidence, 100)

        # Determine direction
        direction = "NEUTRAL"
        signal_type = "HOLD"

        if confidence >= self.min_confidence:
            if momentum > 0.05 and market.price_yes < 0.7:
                direction = "UP"
                signal_type = "MOMENTUM"
            elif momentum < -0.05 and market.price_no < 0.7:
                direction = "DOWN"
                signal_type = "MOMENTUM"
            elif ob_imbalance > 0.2:
                direction = "UP"
                signal_type = "ORDERBOOK"
            elif ob_imbalance < -0.2:
                direction = "DOWN"
                signal_type = "ORDERBOOK"

        # Calculate position sizing
        position_size = self._calc_position_size(confidence, time_pct)

        return Signal(
            market_slug=market.slug,
            direction=direction,
            confidence=confidence,
            signal_type=signal_type,
            reasoning=reasoning,
            suggested_position_size=position_size
        )

    def _calc_ob_imbalance(self, market: MarketData) -> float:
        """Calculate order book imbalance (-1 to 1, positive = bullish)"""
        if market.bid_yes == 0 or market.ask_yes == 0:
            return 0.0
        # Measure pressure on Yes side
        bid_pressure = market.bid_yes
        ask_pressure = 1 - market.ask_yes
        return bid_pressure - ask_pressure

    def _calc_arbitrage(
        self,
        market: MarketData,
        btc_price: BTCPrice,
        momentum: float
    ) -> Optional[str]:
        """Check for arbitrage opportunities"""
        # If spot is moving strongly but Polymarket hasn't adjusted
        if abs(momentum) > 0.1:
            expected_yes = 0.5 + (momentum * 5)  # Rough estimation
            expected_yes = max(0.01, min(0.99, expected_yes))
            diff = abs(market.price_yes - expected_yes)
            if diff > self.arb_threshold:
                return f"Arb: Expected {expected_yes:.2f}, Actual {market.price_yes:.2f}"
        return None

    def _calc_position_size(self, confidence: int, time_pct: float) -> float:
        """Calculate suggested position size based on risk parameters"""
        max_size = self.config.get("max_position_size", 500)
        risk_factor = confidence / 100
        time_factor = max(0.5, time_pct)  # Reduce size near resolution
        return max_size * risk_factor * time_factor


class RiskManager:
    """Manages trading risk"""

    def __init__(self, config: Dict):
        self.max_exposure = config.get("max_exposure", 5000)
        self.risk_per_trade = config.get("risk_per_trade", 0.02)
        self.current_exposure = 0.0

    def check_limits(self, signal: Signal) -> Tuple[bool, str]:
        """Check if signal violates risk limits"""
        if signal.suggested_position_size > self.max_exposure * 0.2:
            return False, "Position size exceeds 20% of max exposure"
        if signal.confidence < 50:
            return False, "Confidence below minimum threshold"
        return True, "OK"

    def calculate_stop_loss(self, signal: Signal, market: MarketData) -> Optional[float]:
        """Suggest stop-loss level"""
        if signal.direction == "UP":
            return max(0.01, market.price_yes * 0.9)
        elif signal.direction == "DOWN":
            return max(0.01, market.price_no * 0.9)
        return None


class DisplayManager:
    """Manages console display output"""

    def __init__(self):
        self.signals: List[Signal] = []
        self.errors: List[str] = []

    def create_layout(self) -> Layout:
        """Create the main display layout"""
        layout = Layout()
        layout.split_column(
            Layout(name="header", size=3),
            Layout(name="main"),
            Layout(name="footer", size=5)
        )
        layout["main"].split_row(
            Layout(name="markets"),
            Layout(name="signals")
        )
        return layout

    def render_header(self, btc_price: BTCPrice) -> Panel:
        """Render header with BTC price"""
        if btc_price.price == 0:
            text = Text("Waiting for BTC price data...", style="yellow")
        else:
            change_color = "green" if btc_price.change_percent >= 0 else "red"
            text = Text()
            text.append(f"BTC: ${btc_price.price:,.2f} ", style="bold cyan")
            text.append(f"({btc_price.change_percent:+.2f}%)", style=change_color)
            text.append(f" | 24h High: ${btc_price.high_24h:,.2f}", style="dim")
            text.append(f" | 24h Low: ${btc_price.low_24h:,.2f}", style="dim")
            text.append(f" | Vol: ${btc_price.volume:,.0f}", style="dim")

        return Panel(text, title="Polymarket BTC Bot", border_style="blue")

    def render_markets(self, markets: Dict[str, MarketData]) -> Panel:
        """Render markets table"""
        table = Table(
            title="Active Markets",
            box=box.ROUNDED,
            header_style="bold magenta"
        )
        table.add_column("Market", style="cyan")
        table.add_column("Time Left", justify="right")
        table.add_column("Yes Price", justify="right")
        table.add_column("No Price", justify="right")
        table.add_column("Spread", justify="right")
        table.add_column("OB Imbalance", justify="right")

        for slug, market in sorted(markets.items()):
            time_left = max(0, market.window_end - time.time())
            mins, secs = divmod(int(time_left), 60)
            time_str = f"{mins}:{secs:02d}"
            time_color = "red" if time_left < 60 else "yellow" if time_left < 180 else "green"

            spread = abs(market.ask_yes - market.bid_yes)
            spread_str = f"{spread:.3f}"

            imbalance = (market.bid_yes - (1 - market.ask_yes)) if market.bid_yes > 0 else 0
            imb_str = f"{imbalance:+.2f}"
            imb_color = "green" if imbalance > 0 else "red"

            table.add_row(
                market.interval,
                f"[{time_color}]{time_str}[/{time_color}]",
                f"{market.price_yes:.3f}",
                f"{market.price_no:.3f}",
                spread_str,
                f"[{imb_color}]{imb_str}[/{imb_color}]"
            )

        return Panel(table, border_style="green")

    def render_signals(self) -> Panel:
        """Render signals panel"""
        table = Table(
            title="Trading Signals",
            box=box.ROUNDED,
            header_style="bold yellow"
        )
        table.add_column("Time", style="dim")
        table.add_column("Market")
        table.add_column("Signal")
        table.add_column("Conf", justify="right")
        table.add_column("Reasoning")

        for sig in self.signals[-5:]:  # Show last 5 signals
            time_str = datetime.fromtimestamp(sig.timestamp).strftime("%H:%M:%S")
            direction_color = "green" if sig.direction == "UP" else "red" if sig.direction == "DOWN" else "dim"
            conf_color = "green" if sig.confidence >= 70 else "yellow" if sig.confidence >= 50 else "red"

            table.add_row(
                time_str,
                sig.market_slug.split("-")[-1][:10],  # Short timestamp
                f"[{direction_color}]{sig.direction}[/{direction_color}]",
                f"[{conf_color}]{sig.confidence}%[/{conf_color}]",
                ", ".join(sig.reasoning[:2]) if sig.reasoning else "-"
            )

        return Panel(table, border_style="yellow")

    def render_footer(self) -> Panel:
        """Render footer with status"""
        text = Text()
        text.append("Controls: ", style="bold")
        text.append("[q]uit ", style="cyan")
        text.append("[p]ause ", style="cyan")
        text.append("[r]efresh ", style="cyan")
        text.append(" | ", style="dim")
        text.append("Status: ", style="bold")
        text.append("RUNNING", style="green")
        return Panel(text, border_style="dim")


class BTCBot:
    """Main bot class"""

    def __init__(self, config: Dict):
        self.config = config
        self.running = True
        self.paused = False
        self.pm_client: Optional[PolymarketClient] = None
        self.price_feed = PriceFeedAggregator()
        self.signal_engine = SignalEngine(config)
        self.risk_manager = RiskManager(config)
        self.display = DisplayManager()
        self.markets: Dict[str, MarketData] = {}
        self.update_interval = config.get("update_interval", 2)

    async def initialize(self):
        """Initialize connections and fetch markets"""
        self.pm_client = await PolymarketClient().__aenter__()
        await self._discover_markets()
        await self.price_feed.start()

    async def _discover_markets(self):
        """Discover current BTC up/down markets"""
        (w5_start, w5_end), (w15_start, w15_end) = self.pm_client.get_current_windows()

        intervals = []
        if self.config.get("interval") in ("5m", "all"):
            intervals.append(("5m", w5_start, w5_end))
        if self.config.get("interval") in ("15m", "all"):
            intervals.append(("15m", w15_start, w15_end))

        for interval, start, end in intervals:
            slug = f"btc-updown-{interval}-{start}"
            console.print(f"[blue]Fetching market: {slug}[/blue]")

            market_data = await self.pm_client.fetch_market(slug)
            if market_data:
                tokens = market_data.get("clobTokenIds", [])
                if len(tokens) >= 2:
                    market = MarketData(
                        slug=slug,
                        interval=interval,
                        window_start=start,
                        window_end=end,
                        token_id_yes=tokens[0],
                        token_id_no=tokens[1]
                    )
                    self.markets[slug] = market
                    console.print(f"[green]✓ Found {interval} market[/green]")
                else:
                    console.print(f"[yellow]⚠ Market {slug} missing token IDs[/yellow]")
            else:
                console.print(f"[yellow]✗ Market {slug} not found[/yellow]")

    async def update(self):
        """Update cycle - fetch latest data and generate signals"""
        if self.paused:
            return

        # Update market data
        for slug, market in self.markets.items():
            await self.pm_client.update_market(market)

            # Generate signal
            if self.price_feed.price.price > 0:
                signal = self.signal_engine.calculate_signal(
                    market,
                    self.price_feed.price,
                    self.price_feed.price_history
                )

                # Add stop loss suggestion
                signal.stop_loss = self.risk_manager.calculate_stop_loss(signal, market)

                # Check risk limits
                ok, msg = self.risk_manager.check_limits(signal)
                if ok and signal.direction != "NEUTRAL":
                    self.display.signals.append(signal)

    def render(self) -> Layout:
        """Render current state"""
        layout = self.display.create_layout()
        layout["header"].update(self.display.render_header(self.price_feed.price))
        layout["markets"].update(self.display.render_markets(self.markets))
        layout["signals"].update(self.display.render_signals())
        layout["footer"].update(self.display.render_footer())
        return layout

    async def run(self):
        """Main run loop"""
        await self.initialize()

        if not self.markets:
            console.print("[red]No markets found. Exiting.[/red]")
            return

        with Live(self.render(), screen=True, refresh_per_second=4) as live:
            while self.running:
                await self.update()
                live.update(self.render())
                await asyncio.sleep(self.update_interval)

    async def stop(self):
        """Stop the bot"""
        self.running = False
        await self.price_feed.stop()


@click.command()
@click.option("--interval", default="all", type=click.Choice(["5m", "15m", "all"]),
              help="Market interval to monitor")
@click.option("--max-exposure", default=5000, help="Maximum exposure in USD")
@click.option("--risk-per-trade", default=0.02, help="Risk per trade (decimal)")
@click.option("--max-position", default=500, help="Maximum position size in USD")
@click.option("--arb-threshold", default=0.05, help="Arbitrage detection threshold")
@click.option("--min-confidence", default=50, help="Minimum confidence threshold")
@click.option("--update-interval", default=2, help="Update interval in seconds")
@click.option("--verbose", is_flag=True, help="Verbose output")
def main(interval, max_exposure, risk_per_trade, max_position, arb_threshold,
         min_confidence, update_interval, verbose):
    """Polymarket BTC Trading Bot Assistant"""

    config = {
        "interval": interval,
        "max_exposure": max_exposure,
        "risk_per_trade": risk_per_trade,
        "max_position_size": max_position,
        "arbitrage_threshold": arb_threshold,
        "min_confidence": min_confidence,
        "update_interval": update_interval,
        "verbose": verbose
    }

    console.print("[bold blue]╔═══════════════════════════════════════════════════╗[/bold blue]")
    console.print("[bold blue]║   Polymarket BTC Trading Bot Assistant v1.0      ║[/bold blue]")
    console.print("[bold blue]╚═══════════════════════════════════════════════════╝[/bold blue]")
    console.print()

    bot = BTCBot(config)

    async def shutdown():
        console.print("\n[yellow]Shutting down...[/yellow]")
        await bot.stop()

    try:
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        asyncio.run(shutdown())
    finally:
        console.print("[green]Bot stopped.[/green]")


if __name__ == "__main__":
    main()
