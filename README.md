# Meridian

A live conflict and news event map in the spirit of liveuamap: a full-screen map with categorized
event markers, a live feed with sources, category and region filters, and event details. It is built
with React, TypeScript, Vite and MapLibre GL, and uses CARTO's free OpenStreetMap basemaps.

Events are **live news reports** from the [GDELT Project](https://www.gdeltproject.org/),
updated every 15 minutes. See [Where the data comes from](#where-the-data-comes-from).

## Run it

```bash
npm install
npm run dev        # http://localhost:5180 (app + live feed API)
npm run build      # type-check + production build to dist/
npm start          # production server on http://localhost:8080 (Node 22.18+)
```

## Features

| Feature | Where |
| --- | --- |
| Full-screen map with clustered, categorized markers (13 categories, each with its own glyph shape *and* color) | `src/components/MapView.tsx`, `src/data/categories.ts` |
| Live feed from GDELT news data: new events stream in, get a **New** badge and a halo on the map | `server/`, `src/data/feed.ts` |
| Region switcher (World, Ukraine, Europe, Middle East, Africa, Asia-Pacific, Americas) with per-region counts | `Filters.tsx › RegionButton` |
| Category filter with counts, Select All / Clear, Alt-click for "only this", and a *Corroborated only* switch | `Filters.tsx › FilterButton` |
| Search across titles, places, admin areas, and countries | `App.tsx` |
| **Time ribbon**: an activity histogram (6H / 24H / 3D / 7D). Drag across it to filter to a window; click to clear | `TimeRibbon.tsx` |
| Event inspector: time, location and coordinates, verification, sources, nearby events, copy link | `EventDetail.tsx` |
| Shareable deep links: `#/ukraine/evt-123` | `src/lib/hash.ts` |
| Keyboard: `J`/`K` browse, `/` search, `F` filters, `L` layers, `H` heatmap, `S` save, `1`–`3` tabs, `\` panel, `?` help | `App.tsx` |
| **Panel tabs**: Events · Saved · Insights | `App.tsx` |
| **Saved events**: bookmark any event; saved events are stored on this device and outlive the 7-day feed window | `App.tsx`, `EventDetail.tsx` |
| **Insights**: event, place and corroboration counts, a breakdown by category (tap to filter), hotspots (tap to fly there) and the most-cited outlets | `Insights.tsx` |
| **Layers**: markers or heatmap, hide approximate locations, follow new events, desktop notifications for new reports that match your filters | `LayersMenu.tsx`, `MapView.tsx` |
| Native share sheet on phones; Copy Link elsewhere | `EventDetail.tsx` |
| Hide the side panel to see the whole map (`\`) | `App.tsx` |
| Keyboard shortcuts sheet (`?`) | `ShortcutsDialog.tsx` |

## Responsive layout

The layout follows the available space rather than the device (`useLayout` in
`src/hooks/useMediaQuery.ts`):

| Tier | When | Layout |
| --- | --- | --- |
| Compact | width ≤ 760 px (phones in portrait) | Bottom sheet with three detents; event details, filters and layers open as sheets |
| Medium | 761–1199 px, or short windows (tablets, small laptops, phones in landscape) | Side panel up to 340 px; event details open inside the panel |
| Wide | ≥ 1200 px and ≥ 560 px tall | Side panel plus a separate event inspector |

Windows shorter than 620 px get a tighter header, and the whole side panel
scrolls as one. Touch screens get 44 pt map controls, and safe-area insets are
respected on devices with notches. Settings (layers, time range, active tab,
panel visibility) and saved events persist in `localStorage`.

## Design notes

The design follows Apple's Human Interface Guidelines, adapted for the web:

- **Two layers.** The map is the content. Translucent "glass" is used only for the floating
  functional layer (sidebar, inspector, time ribbon, map controls), as the HIG's Liquid Glass guidance
  recommends. The list fades at its edges where it meets the header, which stands in for the
  scroll edge effect.
- **Color is never the only signal.** Every category has a distinct glyph, and the ink color on
  each badge is chosen for contrast against its fill.
- **Contrast.** Primary text is about 16:1 and secondary text is 6.0:1 (light) / 6.8:1 (dark). The
  accent is 5.4:1 / 5.6:1.
- **Adaptive.** The app follows the system light/dark setting, and the basemap switches with it.
  It also responds to `prefers-reduced-motion`, `prefers-reduced-transparency` (opaque panels) and
  `prefers-contrast: more`.
- **One signature element.** The time ribbon is the only expressive element. Everything else uses
  system type and quiet, monochrome controls, and the accent blue appears only on interactive and
  selected elements.

## Where the data comes from

GDELT publishes a file every 15 minutes listing the world's news articles with
their headline, outlet and the places they mention, with coordinates. The server
(`server/`) turns that into map events:

1. **Download.** It fetches the last 24 hours of files on first start, then
   checks for new ones every 5 minutes. Files often appear 30–45 minutes after
   GDELT announces them, so recent missing files are retried.
2. **Classify.** `server/classify.ts` keeps articles whose *headline* describes
   a conflict event and assigns a category. It filters out sport, history,
   crime and idioms ("price war", "fighting city hall").
3. **Locate.** It picks the place the headline is about. If only a country or
   province is named, the event is marked *approximate* and drawn fainter.
4. **Merge.** Copies of the same story from different outlets become one event
   with several sources. Two or more outlets show as *Corroborated*.
5. **Cache.** Events are saved to `.cache/gdelt-events.json`, so restarts are
   instant and history builds up to 7 days.

**Limitations.** This is automated news monitoring, not a verified situation
map like liveuamap's (which is edited by hand). Expect some misclassified or
mislocated items, English-language coverage only, and a 30–60 minute delay.
"Corroborated" can mean the same wire story was syndicated by several outlets.

To use sample data instead, set `VITE_FEED=mock` in `.env.local`.

## Territorial control

Each region with a territorial-control layer shows its own occupied areas, and
only on its own tab:

| Tab | Shows | Source | Updates |
| --- | --- | --- | --- |
| **Ukraine** | Russian-occupied areas (red), including Crimea and the areas occupied since 2014, and the contested grey zone (grey) | [DeepStateMap](https://deepstatemap.live) | DeepState publishes about daily; the server checks every 3 hours |
| **Israel–Palestine** | Israeli-held and occupied areas (blue): the West Bank including East Jerusalem, the Golan Heights, the Shebaa Farms, and the part of the Gaza Strip held by Israeli forces. The rest of Gaza is an outline only | [Natural Earth](https://www.naturalearthdata.com) (public domain), [geoBoundaries](https://www.geoboundaries.org) (CC BY 4.0) for Gaza's boundary | Fixed boundaries, downloaded once |

Other tabs (World, Europe and so on) show no territory layer.

The server (`server/territory.ts`) caches each layer in `.cache/territory-<region>.json`
and serves it at `/api/territory?region=ukraine|israel-palestine`. The layer
is drawn under the basemap's place labels. Switch it off under **Layers →
Territorial control**; the legend there shows what the coloured areas are, the
source, and the date.

> **The line inside Gaza is approximate.** No open, regularly updated boundary
> file exists for the ceasefire "Yellow Line", so the Israeli-held zone is a
> hand-made schematic: 14 points in `GAZA_LINE` (`server/territory.ts`), drawn
> from published maps and descriptions as of October 2026 and cut out of Gaza's
> boundary. It covers about 65% of the Strip. Edit those points when the line
> moves, and bump the cache suffix next to `cacheFile` so it is rebuilt. Israeli
> positions in south Lebanon are not drawn: there is no open data for them.

> DeepState's data belongs to DeepState and is credited on the map. Check their
> terms before deploying publicly.

## Telegram channels

Besides GDELT, the server reads public Telegram channels through Telegram's
public web preview (`https://t.me/s/<channel>`). No account or API key is
needed. The defaults are:

| Channel | What it posts |
| --- | --- |
| [@lumsrc](https://t.me/lumsrc) | Liveuamap's source channel: short English front reports, each linking to the original |
| [@GeneralStaffZSU](https://t.me/GeneralStaffZSU) | General Staff of the Armed Forces of Ukraine: Ukrainian-language daily reports and air-defence summaries |

### Adding channels

List channels in `.env.local` (the server reads `.env` and `.env.local` at
startup), then restart:

```
TELEGRAM_CHANNELS=lumsrc@Ukraine,GeneralStaffZSU@Ukraine,nakipelovo@Kharkiv,info_zp@Zaporizhzhia,bessarabiainformcom@Izmail,supernova_plus,exilenova_plus
```

- **`username@Area`.** The home area is where posts that name no specific
  place are shown. Use a city for local news channels, so "two drones hit the
  Osnovianskyi district" lands in Kharkiv. Use `Ukraine` for country-wide
  channels.
- **Without an area** (`supernova_plus`, `bomber_fighter`), a post only appears
  if it names a place *in the same sentence as an event* (an attack, strike,
  explosion, shoot-down, casualties). That suits channels covering strikes
  anywhere, and commentary channels where most posts aren't events.
- **Links work too:** `https://t.me/info_zp/173092@Zaporizhzhia`.
- **Public channels only.** If `https://t.me/s/<username>` shows the posts in a
  browser, the channel works.
- **Filtering.** For general news channels, posts with nothing war-related
  (weather, appointments), awards and memorials, donation appeals, and repeated
  re-posts are filtered out. Short air-raid alerts ("ТРИВОГА В ЗАПОРІЖЖІ") are
  kept.
### Photos and videos

Media attached to posts is shown on list rows (as thumbnails) and in the event
detail (as a gallery with a full-screen viewer). War footage can be graphic,
so media stays **blurred until tapped**; turn this off with **Blur media** in
the Layers menu. Telegram's media links expire after a while, so the app loads
them through `/api/media/tg/...`. That endpoint looks up a fresh link from the
post when the media is opened. Large videos that Telegram only shows in its app
link to the original post.

### X (Twitter) accounts

X has no free public feed, so X accounts are read through the official X API.
It is pay-per-use, at roughly $0.005 per post read; check the current rates on
developer.x.com.

```
X_ACCOUNTS=ralexdc,RikardJozwiak        # same username@Area format; x.com links work too
X_BEARER_TOKEN=...                      # from developer.x.com → your app → Keys and tokens
X_POLL_MS=300000                        # how often to check (default 5 minutes)
```

Without a token, X accounts are skipped and the log says so. Each check asks
only for posts newer than the last one seen, so you pay only for new posts.
Their photos and videos come with them. X posts are geocoded and filtered like
Telegram posts. Only English, Ukrainian and Russian are translated, and the
place database covers Ukraine and its neighbours. An Arabic, Middle
East-focused account like AJABreaking would therefore need more languages and
regions first. On first start the server reads
7 days of history, then polls every 2 minutes (`server/telegram.ts`):

1. **Split.** Long reports are split per paragraph. Paragraphs about losses,
   "no assaults" lines, thanks and sign-offs are dropped.
2. **Skip relays.** A post that another configured channel relays (for
   example a General Staff report that @lumsrc translates) is skipped, so it
   isn't shown twice.
3. **Locate.** Village names are matched against
   [GeoNames](https://www.geonames.org/) (downloaded once into
   `.cache/geonames`, about 17 MB). Spelling variants and Ukrainian
   inflections are handled. Many villages share a name (Ukraine has 15
   called Vilne), so the front **direction** a post names (e.g. "Pokrovsk
   direction") is used to pick the nearest one. Places named as launch sites
   ("launched from Bryansk") are ignored.
4. **Categorize.** English and Ukrainian/Russian vocabulary assigns the
   category.

5. **Translate.** Ukrainian and Russian posts are translated to English in
   the background, and the event detail has a **Show Original** toggle. Set the
   engine with `TRANSLATE_ENGINE`:
   - **Claude** (best quality) is used automatically when `ANTHROPIC_API_KEY`
     is set. It runs `claude-opus-5-5` at low effort, with server-side refusal
     fallback.
   - **Local** (free, offline) uses Helsinki-NLP *opus-mt* models through
     transformers.js, downloaded once (about 150 MB) into `.cache/models`.
     The output is readable but rougher, and such events are labelled
     "machine translation".
   - **Names are never translated by meaning.** Places, front sectors, units,
     weapons and people are written in the Latin alphabet. Established English
     spellings are used where they exist (Pokrovsk, Iskander-M, S-400, Neptune);
     anything else is transliterated with the Ukrainian national standard
     (Poliska, Parodiia, Bryanska oblast). The local engine masks these names
     before translation and restores them afterwards, because it otherwise
     translates village names literally (Світле becomes "Light").
   - Translations are cached in `.cache/translations.json`, so each paragraph
     is translated only once.

Events link to the channel post and to the original source it cites. Use the
**Sources** switch in the filter menu to show only News or only Telegram.

> @lumsrc is Liveuamap's content. Check their terms before deploying this
> publicly.

## Israel–Palestine

**Israel–Palestine** is its own region in the region menu. It covers Israel,
the West Bank, Gaza and the Golan, plus the border front in south Lebanon. It
has these sources; the Arabic ones are translated to English:

| Source | Who they are | How it's read | Language |
| --- | --- | --- | --- |
| Al Jazeera (Arabic) | Qatari network | Telegram [@ajanews](https://t.me/ajanews) | Arabic |
| Al Jazeera Palestine | Al Jazeera's Palestine desk | Telegram [@AJPalestine](https://t.me/AJPalestine) | Arabic |
| Quds News Network | Palestinian news agency | Telegram [@QudsNen](https://t.me/QudsNen) | English |
| Palestinian Information Center | Palestinian outlet close to Hamas | Telegram [@Palinfo](https://t.me/Palinfo) | Arabic |
| Al Mayadeen | Lebanese channel aligned with Hezbollah and Iran | Telegram [@mayadeenchannel](https://t.me/mayadeenchannel) | Arabic |
| Al-Masirah | Houthi-run TV, Yemen | Telegram [@AlmasirahNews](https://t.me/AlmasirahNews) | Arabic |
| Israel Defense Forces | The Israeli military's official channel | Telegram [@idfofficial](https://t.me/idfofficial) | English |
| Emanuel Fabian | Military correspondent, The Times of Israel | Telegram [@manniefabian](https://t.me/manniefabian) | English |
| Abu Ali Express | Israeli channel covering Arab affairs | Telegram [@englishabuali](https://t.me/englishabuali) | English |
| Alaraby TV | Qatari-funded pan-Arab TV | RSS feed (`WEB_FEEDS=alarabytv`) | Arabic |
| i24NEWS | Israeli TV | i24's public JSON feed (`WEB_FEEDS=i24news`) | English |
| Al Jazeera English | Qatari network | RSS (`aljazeera`) | English |
| The Times of Israel | Israeli newspaper | RSS (`timesofisrael`) | English |
| The Jerusalem Post | Israeli newspaper | RSS (`jpost`) | English |
| Middle East Monitor | UK-based, pro-Palestinian | RSS (`memo`) | English |

The list mixes Palestinian, Israeli and regional outlets on purpose: each
reports the same events with its own wording and its own omissions.

Al Jazeera's X account (AJABreaking) needs the paid X API, so its Telegram
channel is used instead.

- **Places.** GeoNames for Israel, Palestine, Lebanon and Syria is loaded in
  full, plus towns across the Middle East, including their Arabic and Hebrew
  names. Arabic has no capital letters, so every 1–3 word run is looked up.
  Attached prepositions and the article are handled ("بغزة" means "in Gaza",
  "الخليل" is Hebron). When only a country is named, the event is placed there
  approximately ("strike on Iran"). A Lebanon story that mentions "الضاحية"
  means Beirut's Dahiyeh, not a Palestinian hamlet of the same name.
- **Gaza landmarks.** Neighbourhoods, camps, hospitals and corridors the news
  names constantly but GeoNames lacks are built in (`LANDMARKS` in
  `server/telegram.ts`): Shuja'iyya, Zeitoun, Sheikh Radwan, Tel al-Hawa,
  Nuseirat, Deir al-Balah, Nasser and Al-Shifa hospitals, the Netzarim and
  Philadelphi corridors and others, in English and Arabic spellings. In English
  posts, "Avigdor Liberman" is a person, not the moshav Avigdor.
- **Categories.** Arabic vocabulary: غارة (airstrike), قصف (shelling), صاروخ
  (missile), مسيرة (drone), اقتحام (raid), اعتراض (interception), شهداء
  (killed) and so on.
- **Translation.** The free local engine uses Helsinki-NLP *opus-mt-ar-en*.
  Place names are swapped for their English names before translation (Ash
  Shaykh Radwan, Tulkarm, Qalqilyah).
- **Perspective.** Translations keep each outlet's own wording: Al-Masirah
  calls Israeli forces "enemy forces", and Al Jazeera calls those killed
  "martyrs" (translated as "killed").

## News from abroad

A post about one of the wars that is really about another country is shown on
that country, at its capital, like diplomatic news on liveuamap:

- **Statements and decisions**: "UAE condemns the strike on Kharkiv", "Германия
  передаст Украине ещё две системы IRIS-T", "الإمارات تدين الغارات على غزة". The
  country has to open the headline and say or do something; the event is
  filed under Politics even though the text mentions a strike.
- **Things happening there**: "В Абу-Дабі розпочалися переговори", "У Німеччині
  затримали шпигуна". Used when the post names no town at the front.

These events keep their war as a `topic`, so the Abu Dhabi talks appear on the
Ukraine tab (and are counted there) as well as on the Middle East tab. The
country table (`server/countries.ts`) has about 55 countries with English,
Ukrainian/Russian and Arabic names, capitals and institutions ("Pentagon",
"Єврокомісія"). The parties to the wars are excluded: a Russian ministry
statement about a strike stays at the place that was hit. Countries named only
in passing ("ATACMS зі США") don't move a post.

## Plugging in another feed

The UI depends only on the `EventFeed` interface in `src/data/feed.ts`:

```ts
interface EventFeed {
  name: string;
  isSample: boolean;
  note: string;
  load(): Promise<MapEvent[]>;
  subscribe(onEvents: (events: MapEvent[]) => void): () => void;
}
```

You can connect real data in either of two ways:

1. **JSON endpoint.** Set `VITE_FEED_URL`. The endpoint returns
   `{ events: MapEvent[], cursor }`. The client then polls `?cursor=<cursor>` and
   receives only new or updated events. A bare `MapEvent[]` also works.
2. **Custom adapter.** Write an adapter (WebSocket, SSE, or a server that normalizes RSS or Telegram
   sources) and return it from `createFeed()`.

Events are merged by `id`, so a feed can send updated versions of existing events.

## Credits

Event data: The GDELT Project (gdeltproject.org). Map data © OpenStreetMap contributors, basemap
tiles © CARTO. The attribution is shown on the map.
