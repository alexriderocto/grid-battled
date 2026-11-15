"""Criterion: Leave game ends the pass.

POST /game/logout -> {ok:true}; afterwards GET /game/session returns null (200), and the
revoked cookie no longer authenticates actions.
"""
from tests.helpers import admin_kill, make_client, rand_name


def test_logout_revokes_session():
    name = rand_name("tscheck-leave")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "112233", "player_class": "standard"})
        assert r.status_code == 200, r.text
        player_id = r.json()["id"]

        r_logout = c.post("/game/logout")
        assert r_logout.status_code == 200, r_logout.text
        assert r_logout.json().get("ok") is True

        r_session = c.get("/game/session")
        assert r_session.status_code == 200, r_session.text
        assert r_session.json() is None

        r_expand = c.post("/game/expand", json={})
        assert r_expand.status_code == 401, r_expand.text

        # Clean up: rejoin with the same credentials to get a fresh cookie and kill the test row.
        r_rejoin = c.post("/game/join", json={"username": name, "password": "112233", "player_class": "standard"})
        assert r_rejoin.status_code == 200
        assert r_rejoin.json()["id"] == player_id
        admin_kill(c, player_id)
