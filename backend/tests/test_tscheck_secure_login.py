"""Criterion: Secure login pass replaces stored code.

Joining sets an httpOnly gb_session cookie and the body never carries the password back;
/game/session (using only the cookie) restores the same commander without resending the code.
"""
from tests.helpers import admin_kill, make_client, rand_name


def test_join_issues_cookie_and_hides_password():
    name = rand_name("tscheck-login")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "135790", "player_class": "standard"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "password" not in body
        assert "password_hash" not in body
        assert "gb_session" in c.cookies
        player_id = body["id"]

        # A fresh client using only the cookie jar can resume the session without the code.
        with make_client() as c2:
            c2.cookies.set("gb_session", c.cookies.get("gb_session"))
            r2 = c2.get("/game/session")
            assert r2.status_code == 200, r2.text
            resumed = r2.json()
            assert resumed is not None
            assert resumed["id"] == player_id
            assert resumed["username"] == name

        admin_kill(c, player_id)
