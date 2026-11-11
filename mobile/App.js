import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View, RefreshControl
} from "react-native";

const API_BASE = "https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/api";

export default function App() {
  const [tab, setTab] = useState("live");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");

  const loadMatches = useCallback(async (selectedTab = tab) => {
    setLoading(true);
    setError("");
    try {
      const endpoint = selectedTab === "live"
        ? "/fixtures?live=all"
        : "/fixtures?date=" + new Date().toISOString().slice(0, 10) + "&timezone=Europe/Istanbul";
      const response = await fetch(API_BASE + endpoint);
      const data = await response.json();
      if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
        const message = data.errors?.rateLimit
          ? "API istek sınırına ulaşıldı. Biraz sonra tekrar dene."
          : "Maç verisi şu anda alınamadı.";
        throw new Error(message);
      }
      setMatches(Array.isArray(data.response) ? data.response : []);
      setUpdated(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e.message || "Bağlantı hatası. Tekrar deneyebilirsin.");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadMatches(tab); }, [tab]);

  const statusText = (fixture) => {
    const s = fixture?.status;
    if (!s) return "—";
    if (s.short === "HT") return "DEVRE ARASI";
    if (s.elapsed != null) return s.elapsed + "'";
    return s.long || s.short || "CANLI";
  };

  const MatchCard = ({ item }) => {
    const home = item.teams?.home;
    const away = item.teams?.away;
    const goals = item.goals || {};
    const live = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(item.fixture?.status?.short);
    return (
      <View style={styles.matchCard}>
        <View style={styles.matchTop}>
          <Text style={styles.league}>{item.league?.country || ""}  ·  {item.league?.name || "Maç"}</Text>
          <Text style={[styles.matchStatus, live && styles.liveStatus]}>{live ? "● " : ""}{statusText(item.fixture)}</Text>
        </View>
        <View style={styles.teamsRow}>
          <View style={styles.team}>
            <Text style={styles.teamName} numberOfLines={2}>{home?.name || "Ev sahibi"}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.score}>{goals.home ?? "-"} : {goals.away ?? "-"}</Text>
          </View>
          <View style={[styles.team, styles.awayTeam]}>
            <Text style={styles.teamName} numberOfLines={2}>{away?.name || "Deplasman"}</Text>
          </View>
        </View>
        <View style={styles.matchBottom}>
          <Text style={styles.muted}>{item.fixture?.venue?.name || item.league?.round || "MRTYLT ANALİZ"}</Text>
          <Text style={styles.muted}>{item.fixture?.date ? new Date(item.fixture.date).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit", timeZone:"Europe/Istanbul"}) : ""}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080D18" />
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
        <TouchableOpacity onPress={() => setTab("live")} style={[styles.tab, tab === "live" && styles.activeTab]}>
          <Text style={[styles.tabText, tab === "live" && styles.activeTabText]}>● CANLI MAÇLAR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("today")} style={[styles.tab, tab === "today" && styles.activeTab]}>
          <Text style={[styles.tabText, tab === "today" && styles.activeTabText]}>BUGÜNÜN FİKSTÜRÜ</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>{tab === "live" ? "Şu anda oynananlar" : "Bugünün maçları"}</Text>
          <Text style={styles.sectionSub}>{updated ? "Son güncelleme " + updated : "Güncel maç verileri"}</Text>
        </View>
        <TouchableOpacity onPress={() => loadMatches(tab)} style={styles.refreshButton}>
          <Text style={styles.refreshText}>↻ Yenile</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl tintColor="#54D6A0" refreshing={loading} onRefresh={() => loadMatches(tab)} />}
      >
        {loading && matches.length === 0 ? <ActivityIndicator size="large" color="#54D6A0" style={{marginTop:30}} /> : null}
        {!!error && <View style={styles.message}><Text style={styles.errorText}>{error}</Text></View>}
        {!loading && !error && matches.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyBall}>⚽</Text>
            <Text style={styles.emptyTitle}>{tab === "live" ? "Şu anda listelenecek canlı maç yok" : "Bugün için maç bulunamadı"}</Text>
            <Text style={styles.emptyCopy}>Daha sonra yenileyerek tekrar kontrol edebilirsin.</Text>
          </View>
        )}
        {matches.map((item) => <MatchCard key={String(item.fixture?.id)} item={item} />)}
        <Text style={styles.footer}>MRTYLT ANALİZ  ·  VERİLER SAĞLAYICI KAYNAKLARDAN ALINIR</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  tabText:{fontSize:10,fontWeight:"800",color:"#8390A4",letterSpacing:.4},
  activeTabText:{color:"#69E0AF"},
  sectionHead:{paddingHorizontal:20,paddingTop:22,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  sectionTitle:{color:"#F4F6FA",fontSize:17,fontWeight:"800"},
  sectionSub:{color:"#7E8BA0",fontSize:11,marginTop:4},
  refreshButton:{backgroundColor:"#1B302F",paddingHorizontal:13,paddingVertical:9,borderRadius:9},
  refreshText:{color:"#6CE0B0",fontSize:12,fontWeight:"800"},
  list:{paddingHorizontal:18,paddingBottom:30},
  matchCard:{backgroundColor:"#111A28",borderRadius:15,padding:14,marginTop:10,borderWidth:1,borderColor:"#202D3D"},
  matchTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  league:{color:"#8E9BB0",fontSize:10,fontWeight:"700",flex:1},
  matchStatus:{color:"#AAB4C3",fontSize:10,fontWeight:"800"},
  liveStatus:{color:"#FF6B78"},
  teamsRow:{flexDirection:"row",alignItems:"center",marginTop:16,marginBottom:14},
  team:{flex:1},
  awayTeam:{alignItems:"flex-end"},
  teamName:{color:"#F2F5FA",fontSize:13,fontWeight:"700"},
  scoreBox:{paddingHorizontal:12},
  score:{color:"#FFFFFF",fontSize:21,fontWeight:"900"},
  matchBottom:{borderTopWidth:1,borderTopColor:"#253142",paddingTop:10,flexDirection:"row",justifyContent:"space-between"},
  muted:{color:"#77859A",fontSize:10},
  empty:{alignItems:"center",padding:28,marginTop:12,backgroundColor:"#101927",borderRadius:16,borderWidth:1,borderColor:"#202D3D"},
  emptyBall:{fontSize:32},
  emptyTitle:{color:"#EAF0F7",fontSize:15,fontWeight:"800",textAlign:"center",marginTop:12},
  emptyCopy:{color:"#8794A8",fontSize:12,textAlign:"center",marginTop:7,lineHeight:18},
  message:{padding:16,marginTop:12,backgroundColor:"#351D28",borderRadius:12},
  errorText:{color:"#FFB6BF",fontSize:12},
  footer:{color:"#59677C",fontSize:9,textAlign:"center",marginTop:24,letterSpacing:.7}
});