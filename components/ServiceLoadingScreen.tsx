import { ActivityIndicator, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ServiceLoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image source={require('../assets/images/icon.png')} style={styles.icon} />
        <Text style={styles.title}>모토맵을 준비하고 있어요</Text>
        <ActivityIndicator color="#79CFFF" style={styles.spinner} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  icon: { width: 72, height: 72, borderRadius: 20, marginBottom: 28 },
  title: { color: '#F5F5F2', fontSize: 18, fontWeight: '700' },
  spinner: { marginTop: 24 },
});
