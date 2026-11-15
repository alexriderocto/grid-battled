"""Criterion: All commander actions work via the cookie only.

POST /api/game/expand without a cookie -> 401; a forged/garbage cookie -> 401;
the real cookie (no username/password in the body) performs the action.
"""
from tests.helpers import admin_kill, make_client, rand_name


def test_expand_requires_valid_cookie_only():
    name = rand_name("tscheck-cookieact")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "246810", "player_class": "standard"})
        assert r.status_code == 200, r.text
        player_id = r.json()["id"]
        start_ap = r.json()["ap"]

        # No cookie at all -> 401
        with make_client() as anon:
            r_noauth = anon.post("/game/expand", json={})
            assert r_noauth.status_code == 401, r_noauth.text

        # Forged cookie -> 401
        with make_client() as forged:
            forged.cookies.set("gb_session", "not-a-real-token-" + name)
            r_forged = forged.post("/game/expand", json={})
            assert r_forged.status_code == 401, r_forged.text

        if start_ap >= 1:
            r_expand = c.post("/game/expand", json={})
            assert r_expand.status_code == 200, r_expand.text
            assert r_expand.json()["range"] >= 1

        admin_kill(c, player_id)
