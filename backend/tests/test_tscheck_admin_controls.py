"""Criterion: Admin controls still work after refactor.

set-range, give-ap, set-class and teleport each mutate the target commander and the admin
password is re-checked on every call; ban prevents rejoin and unban restores it.
"""
import random

from tests.helpers import ADMIN_PASSWORD, admin_kill, make_client, rand_name


def test_admin_set_range_give_ap_set_class_teleport():
    name = rand_name("tscheck-adminctl")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "741741", "player_class": "standard"})
        assert r.status_code == 200, r.text
        p = r.json()
        player_id = p["id"]

        r_range = c.post("/game/admin/set-range", json={"password": ADMIN_PASSWORD, "target_id": player_id, "range": 4})
        assert r_range.status_code == 200, r_range.text
        assert r_range.json()["range"] == 4

        r_ap = c.post("/game/admin/give-ap", json={"password": ADMIN_PASSWORD, "target_id": player_id, "amount": 5})
        assert r_ap.status_code == 200, r_ap.text
        assert r_ap.json()["ap"] >= 5

        r_class = c.post("/game/admin/set-class", json={"password": ADMIN_PASSWORD, "target_id": player_id, "player_class": "healer"})
        assert r_class.status_code == 200, r_class.text
        assert r_class.json()["player_class"] == "healer"

        # Teleport to a free square (occupied squares return a 400, so just try a handful).
        occupied = {(pl["x"], pl["y"]) for pl in c.get("/game/players").json()}
        candidates = [(x, y) for x in range(15) for y in range(15) if (x, y) not in occupied]
        tx, ty = random.choice(candidates)
        r_tp = c.post("/game/admin/teleport", json={"password": ADMIN_PASSWORD, "target_id": player_id, "x": tx, "y": ty})
        assert r_tp.status_code == 200, r_tp.text
        assert (r_tp.json()["x"], r_tp.json()["y"]) == (tx, ty)

        # Wrong admin password rejected on a mutating call.
        r_bad = c.post("/game/admin/give-ap", json={"password": "000000", "target_id": player_id, "amount": 1})
        assert r_bad.status_code == 401, r_bad.text

        admin_kill(c, player_id)


def test_admin_ban_blocks_rejoin_unban_restores():
    name = rand_name("tscheck-adminban")
    with make_client() as c:
        r = c.post("/game/join", json={"username": name, "password": "852852", "player_class": "standard"})
        assert r.status_code == 200, r.text
        player_id = r.json()["id"]

        r_ban = c.post("/game/admin/ban", json={"password": ADMIN_PASSWORD, "target_id": player_id})
        assert r_ban.status_code == 200, r_ban.text

        r_rejoin = c.post("/game/join", json={"username": name, "password": "852852", "player_class": "standard"})
        assert r_rejoin.status_code == 403, r_rejoin.text

        r_unban = c.post("/game/admin/unban", json={"password": ADMIN_PASSWORD, "username": name})
        assert r_unban.status_code == 200, r_unban.text

        r_rejoin2 = c.post("/game/join", json={"username": name, "password": "852852", "player_class": "standard"})
        assert r_rejoin2.status_code == 200, r_rejoin2.text

        admin_kill(c, r_rejoin2.json()["id"])
