import React, {useCallback, useEffect, useRef, useState} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
 ActivityIndicator, SafeAreaView, ScrollView, StatusBar, StyleSheet,
 Text, TouchableOpacity, View, RefreshControl
} from "react-native";
import {fetchFixtures} from "./api-client";
const {statusLabel,isCrediblyLive}=require("./match-rules");
const {normalizeFavorites,toggleFavorite,mergeFavoriteUpdates,normalizeTeamFavorites,toggleTeamFavorite}=require("./favorites");

export default function App(){
 const [tab,setTab]=useState("live");
 const [matches,setMatches]=useState([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [updated,setUpdated]=useState("");
 const [stale,setStale]=useState(false);
 const [favorites,setFavorites]=useState([]);
 const [favoriteTeams,setFavoriteTeams]=useState([]);
 const [favoritesReady,setFavoritesReady]=useState(false);
 const latestRequest=useRef(0);
 const activeController=useRef(null);

 useEffect(()=>{
  let active=true;
  AsyncStorage.getItem("mam-favorites-v1").then(raw=>{
   if(!active||!raw)return;
   try{
    const saved=JSON.parse(raw);
    setFavorites(normalizeFavorites(Array.isArray(saved)?saved:saved?.matches));
    setFavoriteTeams(normalizeTeamFavorites(saved?.teams));
   }catch(_){setFavorites([]);setFavoriteTeams([]);}
  }).catch(()=>{}).finally(()=>{if(active)setFavoritesReady(true);});
  return()=>{active=false;};
 },[]);

 useEffect(()=>{
  if(!favoritesReady)return;
  AsyncStorage.setItem("mam-favorites-v1",JSON.stringify({matches:favorites,teams:favoriteTeams})).catch(()=>{});
 },[favorites,favoriteTeams,favoritesReady]);

 const onToggleFavorite=item=>setFavorites(current=>toggleFavorite(current,item).favorites);
 const onToggleTeamFavorite=team=>setFavoriteTeams(current=>toggleTeamFavorite(current,team).favorites);
 const isMatchFavorite=item=>favorites.some(saved=>String(saved.fixture?.id)===String(item.fixture?.id));
 const isTeamFavorite=team=>favoriteTeams.some(saved=>String(saved.id??saved.name)===String(team?.id??team?.name));

 const loadMatches=useCallback(async(selectedTab=tab)=>{
  if(selectedTab==="favorites"){
   latestRequest.current++;
   activeController.current?.abort();
   activeController.current=null;
   setLoading(false);setError("");
   return;
  }
  const requestId=++latestRequest.current;
  activeController.current?.abort();
  const controller=new AbortController();
  activeController.current=controller;
  setLoading(true);setError("");
  try{
   const result=await fetchFixtures({tab:selectedTab,signal:controller.signal});
   if(requestId===latestRequest.current){
    setMatches(result.matches);
    setFavorites(current=>mergeFavoriteUpdates(current,result.matches));
    setUpdated(new Date(result.updatedAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}));
    setStale(false);
   }
  }catch(e){
   if(requestId===latestRequest.current&&e?.kind!=="aborted"){
    setError(e.message||"Bağlantı hatası. Tekrar deneyebilirsin.");
    setStale(true);
   }
  }finally{
   if(requestId===latestRequest.current){
    setLoading(false);
    if(activeController.current===controller)activeController.current=null;
   }
  }
 },[tab]);

 useEffect(()=>{
  setMatches([]);setUpdated("");setStale(false);
  if(tab!=="favorites")loadMatches(tab);
  else {activeController.current?.abort();activeController.current=null;setLoading(false);setError("");}
  return()=>{
   latestRequest.current++;
   activeController.current?.abort();
   activeController.current=null;
  };
 },[tab,loadMatches]);

 const MatchCard=({item})=>{
  const home=item.teams?.home,away=item.teams?.away,goals=item.goals||{};
  const live=isCrediblyLive(item);
  return <View style={styles.matchCard}>
   <View style={styles.matchTop}>
    <Text style={styles.league}>{item.league?.country||""} · {item.league?.name||"Maç"}</Text>
    <View style={styles.cardActions}>
     <Text style={[styles.matchStatus,live&&styles.liveStatus]}>{live?"● ":""}{statusLabel({fixture:item.fixture})}</Text>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel={isMatchFavorite(item)?"Maçı favorilerden çıkar":"Maçı favorilere ekle"} onPress={()=>onToggleFavorite(item)} style={styles.favoriteButton}>
      <Text style={styles.favoriteGlyph}>{isMatchFavorite(item)?"★":"☆"}</Text>
     </TouchableOpacity>
    </View>
   </View>
   <View style={styles.teamsRow}>
    <View style={styles.team}>
     <View style={styles.teamNameRow}>
      <Text style={styles.teamName} numberOfLines={2}>{home?.name||"Ev sahibi"}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Takım favorisini değiştir: "+(home?.name||"Ev sahibi")} onPress={()=>home&&onToggleTeamFavorite(home)} style={styles.teamFavoriteButton}>
       <Text style={styles.teamFavoriteGlyph}>{home&&isTeamFavorite(home)?"★":"☆"}</Text>
      </TouchableOpacity>
     </View>
    </View>
    <View style={styles.scoreBox}><Text style={styles.score}>{goals.home??"-"} : {goals.away??"-"}</Text></View>
    <View style={[styles.team,styles.awayTeam]}>
     <View style={[styles.teamNameRow,styles.awayTeamNameRow]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Takım favorisini değiştir: "+(away?.name||"Deplasman")} onPress={()=>away&&onToggleTeamFavorite(away)} style={styles.teamFavoriteButton}>
       <Text style={styles.teamFavoriteGlyph}>{away&&isTeamFavorite(away)?"★":"☆"}</Text>
      </TouchableOpacity>
      <Text style={styles.teamName} numberOfLines={2}>{away?.name||"Deplasman"}</Text>
     </View>
    </View>
   </View>
   <View style={styles.matchBottom}>
    <Text style={styles.muted}>{item.fixture?.venue?.name||item.league?.round||"MRTYLT ANALİZ"}</Text>
    <Text style={styles.muted}>{item.fixture?.date?new Date(item.fixture.date).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):""}</Text>
   </View>
  </View>;
 };

 const favoriteCount=favorites.length+favoriteTeams.length;
 const visible=tab==="favorites"?favorites:matches;
 return <SafeAreaView style={styles.safe}>
  <StatusBar barStyle="light-content" backgroundColor="#080D18"/>
  <View style={styles.header}>
   <View>
    <Text style={styles.brand}>MRTYLT <Text style={styles.brandAccent}>ANALİZ</Text></Text>
    <Text style={styles.tagline}>FUTBOL VERİSİ · AKILLI ANALİZ</Text>
   </View>
   <View style={styles.headerMark}><Text style={styles.markText}>M</Text></View>
  </View>
  <View style={styles.hero}>
   <Text style={styles.heroEyebrow}>MAÇ MERKEZİ</Text>
   <Text style={styles.heroTitle}>Futbolun veriye dayalı yüzü.</Text>
   <Text style={styles.heroCopy}>Fikstürleri takip et, maçları analiz et.</Text>
  </View>
  <View style={styles.tabs}>
   <TouchableOpacity onPress={()=>setTab("live")} style={[styles.tab,tab==="live"&&styles.activeTab]}>
    <Text style={[styles.tabText,tab==="live"&&styles.activeTabText]}>● CANLI</Text>
   </TouchableOpacity>
   <TouchableOpacity onPress={()=>setTab("today")} style={[styles.tab,tab==="today"&&styles.activeTab]}>
    <Text style={[styles.tabText,tab==="today"&&styles.activeTabText]}>BUGÜN</Text>
   </TouchableOpacity>
   <TouchableOpacity onPress={()=>setTab("favorites")} style={[styles.tab,tab==="favorites"&&styles.activeTab]}>
    <Text style={[styles.tabText,tab==="favorites"&&styles.activeTabText]}>★ FAVORİLER ({favoriteCount})</Text>
   </TouchableOpacity>
  </View>
  <View style={styles.sectionHead}>
   <View>
    <Text style={styles.sectionTitle}>{tab==="live"?"Şu anda oynananlar":tab==="today"?"Bugünün maçları":"Favorilerim"}</Text>
    <Text style={styles.sectionSub}>{updated?(stale?"Son başarılı veri "+updated+" · bağlantı sorunu":"Son güncelleme "+updated):"Güncel maç verileri"}</Text>
   </View>
   {tab!=="favorites"?<TouchableOpacity onPress={()=>loadMatches(tab)} style={styles.refreshButton}><Text style={styles.refreshText}>↻ Yenile</Text></TouchableOpacity>:null}
  </View>
  <ScrollView contentContainerStyle={styles.list}
   refreshControl={<RefreshControl tintColor="#54D6A0" refreshing={tab!=="favorites"&&loading} onRefresh={()=>tab!=="favorites"&&loadMatches(tab)}/>}>
   {loading&&matches.length===0?<ActivityIndicator size="large" color="#54D6A0" style={{marginTop:30}}/>:null}
   {!!error?<View style={styles.message}><Text style={styles.errorText}>{error}</Text></View>:null}
   {tab==="favorites"&&favoriteTeams.length>0?<View style={styles.favoriteTeamsPanel}>
    <Text style={styles.favoriteTeamsTitle}>Favori takımlar ({favoriteTeams.length})</Text>
    {favoriteTeams.map(team=><View key={String(team.id??team.name)} style={styles.favoriteTeamRow}>
     <Text style={styles.favoriteTeamName}>{team.name}</Text>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Takımı favorilerden çıkar: "+team.name} onPress={()=>onToggleTeamFavorite(team)}><Text style={styles.favoriteGlyph}>★</Text></TouchableOpacity>
    </View>)}
   </View>:null}
   {!loading&&!error&&((tab==="favorites"&&favoriteCount===0)||(tab!=="favorites"&&matches.length===0))?<View style={styles.empty}>
    <Text style={styles.emptyBall}>⚽</Text>
    <Text style={styles.emptyTitle}>{tab==="live"?"Şu anda listelenecek canlı maç yok":tab==="today"?"Bugün için maç bulunamadı":"Henüz favori eklenmedi"}</Text>
    <Text style={styles.emptyCopy}>Daha sonra yenileyerek tekrar kontrol edebilirsin.</Text>
   </View>:null}
   {visible.map(item=><MatchCard key={String(item.fixture?.id)} item={item}/>)}
   <Text style={styles.footer}>MRTYLT ANALİZ · VERİLER SAĞLAYICI KAYNAKLARDAN ALINIR</Text>
  </ScrollView>
 </SafeAreaView>;
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#080D18"},
 header:{paddingHorizontal:22,paddingTop:14,paddingBottom:18,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 brand:{color:"#F5F7FB",fontSize:23,fontWeight:"900",letterSpacing:1.4},
 brandAccent:{color:"#54D6A0"},
 tagline:{color:"#77849B",fontSize:9,fontWeight:"700",letterSpacing:2,marginTop:4},
 headerMark:{width:42,height:42,borderRadius:14,backgroundColor:"#142A2A",borderWidth:1,borderColor:"#285448",alignItems:"center",justifyContent:"center"},
 markText:{color:"#54D6A0",fontWeight:"900",fontSize:22},
 hero:{marginHorizontal:18,backgroundColor:"#111D2C",borderRadius:20,padding:20,borderWidth:1,borderColor:"#203348"},
 heroEyebrow:{color:"#54D6A0",fontSize:10,fontWeight:"800",letterSpacing:2},
 heroTitle:{color:"#FFFFFF",fontSize:24,fontWeight:"800",marginTop:9},
 heroCopy:{color:"#9AA8BA",fontSize:13,marginTop:7},
 tabs:{flexDirection:"row",marginHorizontal:18,marginTop:20,backgroundColor:"#111827",borderRadius:12,padding:4},
 tab:{flex:1,paddingVertical:12,alignItems:"center",borderRadius:9},
 activeTab:{backgroundColor:"#1D3A35"},
 tabText:{fontSize:10,fontWeight:"800",color:"#8390A4",letterSpacing:.2},
 activeTabText:{color:"#69E0AF"},
 sectionHead:{paddingHorizontal:20,paddingTop:22,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 sectionTitle:{color:"#F4F6FA",fontSize:17,fontWeight:"800"},
 sectionSub:{color:"#7E8BA0",fontSize:11,marginTop:4},
 refreshButton:{backgroundColor:"#1B302F",paddingHorizontal:13,paddingVertical:9,borderRadius:9},
 refreshText:{color:"#6CE0B0",fontSize:12,fontWeight:"800"},
 list:{paddingHorizontal:18,paddingBottom:30},
 matchCard:{backgroundColor:"#111A28",borderRadius:15,padding:14,marginTop:10,borderWidth:1,borderColor:"#202D3D"},
 matchTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
 cardActions:{flexDirection:"row",alignItems:"center",gap:8},
 favoriteButton:{minWidth:32,minHeight:32,alignItems:"center",justifyContent:"center"},
 favoriteGlyph:{color:"#69E0AF",fontSize:23,fontWeight:"900"},
 teamNameRow:{flexDirection:"row",alignItems:"center",gap:3,minWidth:0},
 awayTeamNameRow:{justifyContent:"flex-end"},
 teamFavoriteButton:{minWidth:25,minHeight:28,alignItems:"center",justifyContent:"center"},
 teamFavoriteGlyph:{color:"#69E0AF",fontSize:17,fontWeight:"900"},
 favoriteTeamsPanel:{backgroundColor:"#111A28",borderRadius:15,padding:14,marginTop:10,borderWidth:1,borderColor:"#202D3D"},
 favoriteTeamsTitle:{color:"#69E0AF",fontSize:13,fontWeight:"900",marginBottom:8},
 favoriteTeamRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:7,borderBottomWidth:1,borderBottomColor:"#253142"},
 favoriteTeamName:{color:"#F2F5FA",fontSize:13,fontWeight:"700"},
 league:{color:"#8E9BB0",fontSize:10,fontWeight:"700",flex:1,minWidth:0,flexShrink:1},
 matchStatus:{color:"#AAB4C3",fontSize:10,fontWeight:"800",flexShrink:0,textAlign:"right",fontVariant:["tabular-nums"]},
 liveStatus:{color:"#FF6B78"},
 teamsRow:{flexDirection:"row",alignItems:"center",marginTop:16,marginBottom:14},
 team:{flex:1,minWidth:0},
 awayTeam:{alignItems:"flex-end"},
 teamName:{color:"#F2F5FA",fontSize:13,fontWeight:"700",flexShrink:1},
 scoreBox:{paddingHorizontal:6,minWidth:70,alignItems:"center"},
 score:{color:"#FFFFFF",fontSize:21,fontWeight:"900",fontVariant:["tabular-nums"]},
 matchBottom:{borderTopWidth:1,borderTopColor:"#253142",paddingTop:10,flexDirection:"row",justifyContent:"space-between",gap:8},
 muted:{color:"#77859A",fontSize:10},
 empty:{alignItems:"center",padding:28,marginTop:12,backgroundColor:"#101927",borderRadius:16,borderWidth:1,borderColor:"#202D3D"},
 emptyBall:{fontSize:32},
 emptyTitle:{color:"#EAF0F7",fontSize:15,fontWeight:"800",textAlign:"center",marginTop:12},
 emptyCopy:{color:"#8794A8",fontSize:12,textAlign:"center",marginTop:7,lineHeight:18},
 message:{padding:16,marginTop:12,backgroundColor:"#351D28",borderRadius:12},
 errorText:{color:"#FFB6BF",fontSize:12},
 footer:{color:"#59677C",fontSize:9,textAlign:"center",marginTop:24,letterSpacing:.7}
});
