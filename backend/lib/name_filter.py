"""Callsign filter: rejects swear words and racial / hate slurs in usernames.

Two tiers keep false positives low (the "Scunthorpe problem"):
  * SUBSTRING terms are blocked anywhere in the name — they essentially never occur inside
    innocent words (e.g. "xXfuckXx", "f_u_c_k", "5h1tlord").
  * TOKEN terms are short words that DO appear inside innocent words ("dick" in "Dickens",
    "spic" in "spicy", "paki" in "Pakistan"), so they're only blocked as a whole word-part:
    "BigDick99" -> tokens [big, dick] -> blocked; "Dickens" -> [dickens] -> allowed.

Normalisation defeats common evasion: case, accents/look-alike unicode, leetspeak
(0->o, 1->i/l, 3->e, 4->a, 5->s, 7->t, @->a, $->s ...), separators and repeated letters.
"""

import re
import unicodedata

SUBSTRING_TERMS = [
    # swearing / sexual
    "fuck", "fuk", "fck", "phuck", "shit", "sh1t", "cunt", "bitch", "biatch", "wank", "twat",
    "slut", "whore", "pussy", "asshole", "arsehole", "bastard", "bollock", "bellend", "knobend",
    "motherf", "jizz", "dildo", "porn", "blowjob", "handjob", "cumshot", "piss", "tosser",
    "shag", "nonce", "paedo", "pedo",
    # racial / hate slurs
    "nigger", "nigga", "niga", "nigg", "negro", "faggot", "fagot", "retard", "tranny", "kike",
    "wetback", "beaner", "raghead", "towelhead", "sandnigger", "gollywog", "golliwog", "chinaman",
    "pikey", "gyppo", "hitler", "heilhitler", "siegheil", "kkk", "whitepower",
]

TOKEN_TERMS = [
    "ass", "arse", "dick", "cock", "cum", "tit", "tits", "fag", "fags", "prick", "knob", "twats",
    "spic", "spick", "chink", "coon", "gook", "paki", "pakis", "wog", "jap", "dyke", "nazi",
    "rape", "rapist", "rapists", "homo", "slag", "skank", "crap", "damn", "bugger", "sod", "nob", "wop", "yid",
]

_LEET = str.maketrans({"0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
                       "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l"})


def _fold(text: str) -> str:
    """Lowercase, strip accents/compat forms, apply leetspeak (1 handled separately)."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().translate(_LEET)


def _collapse(text: str) -> str:
    """Squash runs of a repeated letter: 'fuuuuck' -> 'fuck', 'nigger' -> 'niger'."""
    return re.sub(r"(.)\1+", r"\1", text)


def _stretch_variants(letters: str) -> set[str]:
    """Undo letter-stretching ('fuuuuck', 'niggggger') without merging genuine doubles
    ('shiitake' must stay 'shiitake'): runs of 3+ squashed to one AND to two letters."""
    return {letters, re.sub(r"(.)\1{2,}", r"\1", letters), re.sub(r"(.)\1{2,}", r"\1\1", letters)}


_TOKENS = set(TOKEN_TERMS)


def _variants(raw: str) -> list[str]:
    folded = _fold(raw)
    return [folded.replace("1", "i"), folded.replace("1", "l")]


def _tokens(raw: str) -> list[str]:
    """Split on separators, digits and camelCase: 'BigDick_99' -> ['big', 'dick']."""
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", raw)
    plain = unicodedata.normalize("NFKD", spaced)
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch)).lower()
    parts: list[str] = [p for p in re.split(r"[^a-z]+", plain) if p]  # digits split words: dick99
    for variant in _variants(spaced):
        parts += [p for p in re.split(r"[^a-z]+", variant) if p]
    return parts


def is_offensive(username: str) -> bool:
    for variant in _variants(username):
        letters = re.sub(r"[^a-z]", "", variant)
        for form in _stretch_variants(letters):
            if any(term in form for term in SUBSTRING_TERMS):
                return True
            if form in _TOKENS:  # the whole name is a token word
                return True
    for tok in _tokens(username):
        base = tok[:-1] if tok.endswith("s") and len(tok) > 3 else tok
        if any(f in _TOKENS for f in _stretch_variants(tok) | {base}):
            return True
    return False


REJECTION = "That callsign isn't allowed — please choose another (no swearing or slurs)"
