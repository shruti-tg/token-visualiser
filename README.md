# Token Ledger

A beautiful, client-side tool to visualize Claude API token usage from session logs.

## Features

- 📊 **Token Visualization** - See exactly where your tokens are going with interactive charts
- 💰 **Cost Breakdown** - Understand the financial impact of cache hits vs misses
- 📈 **Session Analytics** - Track API calls, context growth, and tool usage
- 🎨 **Multiple Themes** - Choose from 5 beautiful color palettes (workshop, cream, sage, plum, slate)
- 🔒 **100% Client-Side** - All processing happens in your browser, no data uploads
- ⚡ **Fast & Responsive** - Instant parsing and rendering of session data

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Drop a file**: Click on the drop zone or drag a `.jsonl` Claude Code session log into the app
2. **View results**: The app will instantly parse and display:
   - Summary stats (API calls, token counts, cost, cache savings)
   - Token flow visualization across calls
   - Context growth over the session
   - Cost comparison with/without caching
   - Detailed ledger of every API call
   - Tool usage breakdown

## File Format

The app expects Claude Code session logs in JSONL format with the following structure:

```json
{
  "message": {
    "role": "assistant",
    "id": "msg_123",
    "usage": {
      "input_tokens": 1000,
      "output_tokens": 500,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0
    },
    "content": [
      {
        "type": "tool_use",
        "name": "Read"
      }
    ]
  },
  "timestamp": 1234567890,
  "time": "2024-01-01T12:00:00Z"
}
```

## Architecture

- **Framework**: Next.js 14 with TypeScript
- **Styling**: Custom CSS with CSS variables for theme support
- **Fonts**: Bricolage Grotesque, Instrument Serif, JetBrains Mono
- **Design**: Hand-drawn, editorial aesthetic with rounded corners and shadows

## Pricing Reference

The tool uses official Claude Sonnet 4.6 pricing:
- Input tokens: $3.00 / Mtok
- Output tokens: $15.00 / Mtok
- Cache write: $3.75 / Mtok (5-minute cache)
- Cache read: $0.30 / Mtok (90% discount!)

## Development

### Build for production

```bash
npm run build
npm start
```

### Type checking

```bash
npx tsc --noEmit
```

## Design Palettes

The app ships with 5 carefully curated color palettes:

1. **Workshop** (default) - Warm editorial palette with coral and denim
2. **Cream** - Bright and energetic with vibrant accents
3. **Sage** - Muted earth tones with green and rust
4. **Plum** - Cool purples with pink and blue accents
5. **Slate** - Professional grays with coral and blue highlights

Switch between palettes using the fixed palette switcher in the top-right corner.
