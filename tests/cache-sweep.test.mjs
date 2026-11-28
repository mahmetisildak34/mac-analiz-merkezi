import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const cache=require("../mam-cache-manager.js");

function storageWith(entries){
  const values=new Map(entries);
  return {
    get length(){return values.size;},
    key(index){return [...values.keys()][index]??null;},
    getItem(key){return values.has(key)?values.get(key):null;},
    setItem(key,value){values.set(key,String(value));},
    removeItem(key){values.delete(key);},
    has(key){return values.has(key);}
  };
}

test("cache sweep removes obsolete versions and legacy CSV bodies only",()=>{
  const entries=[
    ["mam_history_v80_203_team_1","old"],
    ["mam_d1_archive_v3_203_team_1","old"],
    ["mam_league_csv_v12_3","old"],
    ["mam_league_csv_v13_3","legacy full CSV body"],
    ["mam_fixture_cache_v2_203","old"],
    ["mam_api_cache_v1_archive","old"],
    ["mam_history_v81_203_team_1","current"],
    ["mam_d1_archive_v4_203_team_1","current"],
    ["mam_history_v82_future","unknown future version"],
    ["mam-product-hub-v1",'{"favoriteMatches":["f1"],"favoriteTeams":["t1"]}'],
    ["mam_favorite_labels_v1",'{"teams":{"t1":"Team"}}'],
    ["mam_session_token","session"],
    ["mam_coupon_v1",'["coupon"]'],
    ["mam_coupon_candidates_v1",'["candidate"]'],
    ["mam_app_view_state",'{"mode":"home"}'],
    ["mam_user_settings",'{"theme":"dark"}'],
    ["unrelated","preserve"]
  ];
  const storage=storageWith(entries);
  const result=cache.sweep(storage);
  assert.deepEqual(result.removed,entries.slice(0,6).map(([key])=>key));
  assert.deepEqual(result.preserved,["mam-product-hub-v1","mam_favorite_labels_v1","mam_session_token","mam_coupon_v1","mam_coupon_candidates_v1","mam_app_view_state"]);
  for(const [key] of entries.slice(0,6))assert.equal(storage.has(key),false,key);
  for(const [key] of entries.slice(6))assert.equal(storage.has(key),true,key);
});
