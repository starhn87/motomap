import { Image, StyleSheet, View } from 'react-native';

export default function ServiceLoadingScreen() {
  return (
    <View accessible accessibilityLabel="모토맵을 준비하고 있어요" style={styles.container}>
      {/* 네이티브 스플래시와 같은 전체 화면·원본 이미지를 이어서 보여준다. */}
      <Image
        accessibilityElementsHidden
        source={require('../assets/images/splash-icon.png')}
        resizeMode="contain"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
});
