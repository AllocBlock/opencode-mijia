import sys, json, time, threading

def log_err(msg):
    print(json.dumps({"error": msg}), file=sys.stderr, flush=True)

try:
    from mijiaAPI import mijiaAPI
    api = mijiaAPI()
    if not api.available:
        print(json.dumps({"error": "auth failed"}), file=sys.stderr, flush=True)
        sys.exit(1)

    devices = api.get_devices_list()
    did_map = {}
    model_map = {}
    for d in devices:
        did_map[d["did"]] = d
        model_map[d["did"]] = d["model"]

    prop_cache = {}
    cache_dir = api.auth_data_path.parent
    for did, model in model_map.items():
        cache_file = cache_dir / f"{model}.json"
        if cache_file.exists():
            with open(cache_file, "r", encoding="utf-8") as f:
                info = json.load(f)
            pm = {}
            for p in info.get("properties", []):
                pm[p["name"]] = p
                if "-" in p["name"]:
                    pm[p["name"].replace("-", "_")] = p
            prop_cache[did] = pm

except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr, flush=True)
    sys.exit(1)

lock = threading.Lock()

def ensure_cache(did):
    if did in prop_cache:
        return prop_cache[did], None
    model = model_map.get(did)
    if not model:
        return None, f"device {did} not found"
    from mijiaAPI.devices import get_device_info as gdi
    gdi(model, cache_path=cache_dir)
    cache_file = cache_dir / f"{model}.json"
    with open(cache_file, "r", encoding="utf-8") as f:
        info = json.load(f)
    pm = {}
    for p in info.get("properties", []):
        pm[p["name"]] = p
        if "-" in p["name"]:
            pm[p["name"].replace("-", "_")] = p
    prop_cache[did] = pm
    return pm, None


def handle_set(req):
    req_id = req["id"]
    did = req["did"]
    pairs = req["props"]

    pm, err = ensure_cache(did)
    if err:
        return {"id": req_id, "error": err}

    params = []
    for pname, pval in pairs:
        prop = pm.get(pname)
        if not prop:
            return {"id": req_id, "error": f"unknown prop: {pname}"}
        if "w" not in prop.get("rw", ""):
            return {"id": req_id, "error": f"prop {pname} not writable"}

        ptype = prop["type"]
        siid = prop["method"]["siid"]
        piid = prop["method"]["piid"]

        if ptype == "bool":
            v = str(pval).lower()
            if v in ("true", "1"):
                value = True
            elif v in ("false", "0"):
                value = False
            else:
                return {"id": req_id, "error": f"invalid bool: {v}"}
        elif ptype in ("int", "uint"):
            value = int(pval)
        elif ptype == "float":
            value = float(pval)
        else:
            value = str(pval)

        params.append({"did": did, "siid": siid, "piid": piid, "value": value})

    try:
        api.set_devices_prop(params)
        time.sleep(0.1)
        return {"id": req_id, "ok": True}
    except Exception as e:
        return {"id": req_id, "error": str(e)}


def handle_get(req):
    req_id = req["id"]
    did = req["did"]
    names = req["props"]

    pm, err = ensure_cache(did)
    if err:
        return {"id": req_id, "error": err}

    params = []
    values = {}
    for pname in names:
        prop = pm.get(pname)
        if not prop:
            return {"id": req_id, "error": f"unknown prop: {pname}"}
        if "r" not in prop.get("rw", ""):
            return {"id": req_id, "error": f"prop {pname} not readable"}
        params.append({"did": did, "siid": prop["method"]["siid"], "piid": prop["method"]["piid"]})

    try:
        results = api.get_devices_prop(params)
        for r in results:
            if r.get("code") != 0:
                return {"id": req_id, "error": f"get failed: code={r.get('code')}"}
        for i, pname in enumerate(names):
            values[pname] = results[i].get("value")
        return {"id": req_id, "ok": True, "values": values}
    except Exception as e:
        return {"id": req_id, "error": str(e)}


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
    except Exception:
        continue

    method = req.get("method")
    if method == "ping":
        resp = {"id": req.get("id"), "ok": True}
    elif method == "set":
        with lock:
            resp = handle_set(req)
    elif method == "get":
        with lock:
            resp = handle_get(req)
    else:
        resp = {"id": req.get("id"), "error": f"unknown method: {method}"}

    print(json.dumps(resp, ensure_ascii=False), flush=True)
