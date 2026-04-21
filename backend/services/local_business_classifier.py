"""Local business classifier that filters chain/non-local businesses.

Uses a scoring system based on Google Place types, business name pattern
matching (against a comprehensive chain-name regex), website domain
analysis, and address structure to classify businesses as local or
non-local. Businesses that fail the threshold (0.60) are excluded from
Vantage's discovery results.
"""
import re
from typing import Tuple

LOCAL_CONFIDENCE_THRESHOLD = 0.60

_DISQUALIFYING_TYPES: frozenset[str] = frozenset({
    "city_hall", "courthouse", "embassy", "fire_station",
    "local_government_office", "government_office", "police",
    "airport", "bus_station", "light_rail_station", "subway_station",
    "train_station", "transit_station", "ferry_terminal",
    "campground", "natural_feature", "park", "national_park",
    "rv_park", "tourist_attraction",
    "primary_school", "secondary_school", "school", "university",
    "post_office",
    "cemetery", "church", "hindu_temple", "mosque", "synagogue",
    "place_of_worship", "stadium", "amusement_park", "library",
})

_CHAIN_PRONE_TYPES: frozenset[str] = frozenset({
    "atm", "bank", "car_dealer", "car_rental",
    "convenience_store", "department_store", "drugstore",
    "gas_station", "grocery_or_supermarket", "hospital",
    "parking", "pharmacy", "shopping_mall", "supermarket",
})

_LOCAL_FAVORING_TYPES: frozenset[str] = frozenset({
    "bakery", "bar", "beauty_salon", "book_store", "cafe",
    "clothing_store", "electrician", "florist", "food",
    "furniture_store", "hair_care", "hardware_store",
    "home_goods_store", "jewelry_store", "laundry",
    "locksmith", "meal_delivery", "meal_takeaway", "moving_company",
    "nail_salon", "painter", "pet_store", "plumber", "restaurant",
    "roofing_contractor", "shoe_store", "spa", "store",
    "tailor", "tattoo_parlor", "veterinary_care",
})

_CHAIN_NAME_PATTERNS: list[str] = [
    r"\bmcdonald'?s?\b", r"\bburger king\b", r"\bwendy'?s?\b",
    r"\btaco bell\b", r"\bchick-?fil-?a\b", r"\bpopeyes?\b",
    r"\bkfc\b", r"\bdomino'?s?\b", r"\bpizza hut\b", r"\bpapa john'?s?\b",
    r"\bsubway\b", r"\bchipotle\b", r"\bpanda express\b",
    r"\bdunkin'?\b", r"\bstarbucks\b", r"\btim hortons?\b",
    r"\bjamba juice\b", r"\bsmoothie king\b",
    r"\bfive guys\b", r"\bwingstop\b", r"\bbuffalo wild wings?\b",
    r"\bapplebee'?s?\b", r"\bchili'?s?\b", r"\bdenny'?s?\b",
    r"\bihop\b", r"\bcracker barrel\b", r"\bolive garden\b",
    r"\bred lobster\b", r"\blonghorn steakhouse\b",
    r"\boutback steakhouse\b", r"\btexas roadhouse\b",
    r"\bpanera\b", r"\bjason'?s? deli\b", r"\bjersey mike'?s?\b",
    r"\bfirehouse subs?\b", r"\bquiznos?\b",
    r"\bblaze pizza\b", r"\bmod pizza\b",
    r"\bshake shack\b", r"\bin-n-out\b",
    r"\bwhataburger\b", r"\bsonic drive-?in\b",
    r"\barby'?s?\b", r"\bdairy queen\b", r"\bnoodles? (&|and) (company|co\.?)\b",
    r"\bwingstop\b",
    r"\bboston pizza\b",
    r"\bswiss chalet\b",
    r"\bharvey'?s?\b",
    r"\ba&w\b", r"\ba and w\b",
    r"\bmontana'?s?\b",
    r"\bkelsey'?s?\b",
    r"\beast side mario'?s?\b",
    r"\bjack astor'?s?\b",
    r"\bthe keg\b",
    r"\bmilestones restaurant\b",
    r"\bst-?hubert\b",
    r"\bteriyaki experience\b",
    r"\bmr\.?\s*sub\b",
    r"\bsecond cup\b",
    r"\bcountry style\b",
    r"\bbaskin[- ]?robbins?\b",
    r"\burban outfitters\b",
    r"\bshangri-?la\b",
    r"\bwalking on a cloud\b",
    r"\bstag shop\b",
    r"\bcold stone creamery\b",
    r"\bdairy belle\b",
    r"\bpeet'?s?(?: coffee)?\b", r"\bbiggby\b",
    r"\bscooter'?s? coffee\b", r"\bthe human bean\b",
    r"\bcoffee bean\b", r"\bbrugger'?s?\b",
    r"\bwalmart\b", r"\btarget\b", r"\bcostco\b", r"\bsam'?s? club\b",
    r"\bkohl'?s?\b", r"\bmacy'?s?\b", r"\bnordstrom\b",
    r"\bthe gap\b", r"\bh&m\b", r"\buniqlo\b", r"\bzara\b",
    r"\bold navy\b", r"\bbanana republic\b",
    r"\bbest buy\b", r"\bstaples\b", r"\boffice depot\b",
    r"\bhome depot\b", r"\blowe'?s?\b", r"\bmenards?\b",
    r"\bikea\b", r"\bcrate and barrel\b", r"\bpottery barn\b",
    r"\bbath &amp; body works\b", r"\bbath & body works\b",
    r"\bvictoria'?s? secret\b", r"\bspencer'?s?\b", r"\bclaire'?s?\b",
    r"\bforever 21\b", r"\baeropostale\b", r"\bamerican eagle\b",
    r"\babercrombie\b", r"\bhollister\b",
    r"\bparty city\b",
    r"\bpublic storage\b", r"\bextra space storage\b", r"\bcubesmart\b",
    r"\blife storage\b",
    r"\brona\b",
    r"\bcanadian tire\b",
    r"\bhomesense\b",
    r"\bwinners\b",
    r"\bthe bay\b", r"\bhudson'?s? bay\b",
    r"\bmark'?s?(?:\s+work\s+wearhouse)?\b",
    r"\bchapters?\b",
    r"\bindigo books?\b",
    r"\bsport chek\b", r"\bsports chek\b",
    r"\bgolf town\b",
    r"\breitmans?\b",
    r"\bpennington'?s?\b",
    r"\baldo\b",
    r"\bwilson'?s? leather\b",
    r"\bwhole foods\b", r"\btrader joe'?s?\b", r"\bpublix\b",
    r"\bkroger\b", r"\bsafeway\b", r"\baldi\b",
    r"\bwinn-?dixie\b", r"\bfood lion\b", r"\bpiggly wiggly\b",
    r"\bwegmans?\b", r"\bmeijer\b", r"\bh-?e-?b\b",
    r"\bloblaws?\b",
    r"\bno frills\b",
    r"\bzehrs?\b",
    r"\bfreshco\b",
    r"\bfood basics\b",
    r"\bfarm boy\b",
    r"\breal canadian superstore\b",
    r"\bwalgreens?\b", r"\bcvs\b", r"\bride aid\b",
    r"\bshoppers drug mart\b",
    r"\bchevron\b", r"\bexxon\b", r"\bmobil\b",
    r"\bpetro-?canada\b",
    r"\bcitgo\b", r"\bsunoco\b",
    r"\bvalero\b", r"\b7-?eleven\b", r"\bcircle k\b",
    r"\bquiktrip\b", r"\bwawa\b", r"\bsheetz\b", r"\bstripes\b",
    r"\bchase bank?\b", r"\bbank of america\b", r"\bwells fargo\b",
    r"\bcitibank\b", r"\bus bank\b", r"\btd bank\b",
    r"\bpnc bank?\b", r"\bregions bank?\b", r"\bbb&t\b",
    r"\bsuntrust\b", r"\bfifth third\b",
    r"\bscotiabank\b",
    r"\bcibc\b",
    r"\brbc\b",
    r"\bbmo\b",
    r"\btd canada trust\b",
    r"\bnational bank\b",
    r"\bjiffy lube\b", r"\bmidas\b", r"\bpep boys\b",
    r"\bautozone\b", r"\bo'reilly auto\b", r"\bnapa auto\b",
    r"\badvance auto\b",
    r"\bplanet fitness\b", r"\bla fitness\b", r"\banytime fitness\b",
    r"\bgold'?s? gym\b", r"\bequinox\b", r"\bcrunch fitness\b",
    r"\b24 hour fitness\b", r"\blife time fitness\b",
    r"\bgoodlife fitness\b",
    r"\bmarriott\b", r"\bhilton\b", r"\bihg\b", r"\bholiday inn\b",
    r"\bhampton inn\b", r"\bcourtyard by marriott\b", r"\bfairfield inn\b",
    r"\bbest western\b", r"\bmotel 6\b", r"\bsuper 8\b",
    r"\bhyatt\b", r"\bsheraton\b",
    r"\bfairmont\b",
    r"\bdoubletree\b",
    r"\bnovotel\b",
    r"\bcrowne plaza\b",
    r"\bwyndham\b",
    r"\bramada\b",
    r"\btravelodge\b",
    r"\bdays inn\b",
    r"\bcomfort inn\b",
    r"\bquality inn\b",
    r"\bla quinta\b",
    r"\bfour points\b",
    r"\bandaz\b",
    r"\bst\.? regis\b",
    r"\bgreat clips\b", r"\bsupercuts?\b", r"\bfantastic sams?\b",
    r"\bregis salon\b", r"\bsport clips\b",
    r"\buhaul\b", r"\bpetsmart\b", r"\bpetco\b",
    r"\bbig lots?\b", r"\bdollar tree\b", r"\bdollar general\b",
    r"\bfamily dollar\b", r"\bfive below\b",
    r"\bgoodwill\b", r"\bvisionworks\b", r"\blenscrafters?\b",
    r"\bamerica'?s? best contacts\b", r"\bpearle vision\b",
    r"\bups store\b", r"\bthe ups store\b", r"\bfedex office\b",
    r"\bcanada post\b",
    r"\bat&t\b", r"\bverizon\b", r"\bt-?mobile\b", r"\bsprint\b",
    r"\brogers\b",
    r"\btelus\b",
    r"\bfido\b",
    r"\blucky mobile\b",
    r"\bkoodo\b",
    r"\bvirgin plus\b",
    r"\bbell mobility\b", r"\bbell store\b", r"\bbell canada\b",
]
_CHAIN_RE = re.compile("|".join(_CHAIN_NAME_PATTERNS), re.IGNORECASE)

_CHAIN_DOMAINS: frozenset[str] = frozenset({
    "mcdonalds.com", "bk.com", "wendys.com", "tacobell.com",
    "chickfila.com", "popeyes.com", "kfc.com", "dominos.com",
    "pizzahut.com", "papajohns.com", "subway.com", "chipotle.com",
    "pandaexpress.com", "dunkindonuts.com", "dunkin.com", "starbucks.com",
    "timhortons.com", "shakeshack.com", "whataburger.com",
    "bostonpizza.com",
    "swisschalet.com", "harveys.ca", "aw.ca", "montanas.ca",
    "kelseys.com", "thekeg.com", "secondcup.com",
    "baskinrobbins.com",
    "walmart.com", "target.com", "costco.com", "kohls.com",
    "macys.com", "nordstrom.com", "gap.com", "hm.com",
    "zara.com", "oldnavy.com", "bananarepublic.com",
    "bestbuy.com", "homedepot.com", "lowes.com", "menards.com",
    "ikea.com", "crateandbarrel.com",
    "rona.ca", "canadiantire.ca",
    "homesense.ca", "winners.ca", "thebay.com",
    "sportchek.ca", "golftown.com",
    "partycity.com", "publicstorage.com",
    "wholefoodsmarket.com", "traderjoes.com", "publix.com",
    "kroger.com", "safeway.com", "aldi.us", "foodlion.com",
    "loblaws.ca", "nofrills.ca", "freshco.ca",
    "walgreens.com", "cvs.com", "riteaid.com",
    "shoppersdrugmart.ca",
    "7-eleven.com", "circlek.com", "wawa.com", "sheetz.com",
    "petrocanada.ca",
    "chase.com", "bankofamerica.com", "wellsfargo.com",
    "citibank.com", "usbank.com", "tdbank.com", "pnc.com",
    "scotiabank.com", "cibc.com", "rbc.com", "bmo.com",
    "autozone.com", "oreillyauto.com", "pepboys.com",
    "planetfitness.com", "lafitness.com", "anytimefitness.com",
    "goldsgym.com", "equinox.com", "goodlifefitness.com",
    "marriott.com", "hilton.com", "ihg.com", "bestwestern.com",
    "hyatt.com", "motel6.com",
    "fairmont.com", "wyndham.com", "ramada.com", "travelodge.com",
    "daysinn.com", "comfortinn.com", "laQuinta.com",
    "greatclips.com", "supercuts.com", "sportclips.com",
    "uhaul.com", "petsmart.com", "petco.com",
    "dollartree.com", "dollargeneral.com", "familydollar.com",
    "fivebelow.com", "goodwill.com", "lenscrafters.com",
    "theupsstore.com", "fedex.com",
    "att.com", "verizon.com", "t-mobile.com",
    "panera.com", "firehouse.com", "jerseymikes.com",
})

_STREET_NUM_RE = re.compile(r"^\d+")

def classify_local_business(place: dict) -> Tuple[bool, float]:
    """Classify a Google Place as local or non-local.

    Scoring starts at 0.50 and is adjusted by:
    - Disqualifying types (government, transit, places of worship) -> immediate rejection
    - Local-favoring types (bakery, bar, beauty_salon, etc.) -> +0.20
    - Chain-prone types (ATM, bank, supermarket, etc.) -> -0.20
    - Chain name regex match -> immediate rejection
    - Chain website domain -> immediate rejection
    - Street number in address -> +0.10
    - Short single-word name -> -0.10

    Args:
        place (dict): Google Place result with ``business_status``, ``name``,
            ``types``, ``vicinity``, ``website`` fields.

    Returns:
        Tuple[bool, float]: (is_local, confidence) where confidence is
            between 0.0 and 1.0. ``is_local`` is True when confidence >= 0.60.
    """
    score = 0.50

    raw_status = (
        place.get("businessStatus")
        or place.get("business_status")
        or ""
    )
    if raw_status.upper() != "OPERATIONAL":
        return False, 0.0

    address = (
        place.get("formattedAddress")
        or place.get("formatted_address")
        or place.get("vicinity")
        or ""
    )
    if _STREET_NUM_RE.match(address.strip()):
        score += 0.10
    else:
        score -= 0.05

    types: list[str] = place.get("types") or []
    primary_type: str = place.get("primaryType") or (types[0] if types else "")

    all_types = set(types)
    if primary_type:
        all_types.add(primary_type)

    if all_types & _DISQUALIFYING_TYPES:
        return False, 0.0

    if all_types & _LOCAL_FAVORING_TYPES:
        score += 0.20

    if all_types & _CHAIN_PRONE_TYPES:
        score -= 0.20

    display_name_raw = place.get("displayName") or place.get("name") or ""
    if isinstance(display_name_raw, dict):
        display_name = display_name_raw.get("text", "")
    else:
        display_name = str(display_name_raw)

    if _CHAIN_RE.search(display_name):
        return False, 0.0

    name_words = display_name.strip().split()
    if len(name_words) == 1 and len(display_name) <= 7:
        score -= 0.10

    website = place.get("websiteUri") or place.get("website") or ""
    if website:
        domain_match = re.search(r"https?://(?:www\.)?([^/?]+)", website)
        if domain_match:
            domain = domain_match.group(1).lower()
            if domain in _CHAIN_DOMAINS:
                return False, 0.0
            if re.search(r"\b(corp|corporate|franchise|holding|inc|llc)\b", domain):
                score -= 0.10
        score += 0.05
    else:
        score += 0.05

    confidence = round(max(0.0, min(1.0, score)), 4)
    is_local = confidence >= LOCAL_CONFIDENCE_THRESHOLD
    return is_local, confidence
