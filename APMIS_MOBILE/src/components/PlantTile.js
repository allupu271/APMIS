import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// Deterministic gradient per plant so tiles look varied but stable across
// renders. Swap to the server-provided photo by passing `imageUrl` once the
// backend exposes it — the leaf tile is the fallback until then.
const TILE_GRADIENTS = [
  ['#66BB6A', '#2E7D32'],
  ['#26A69A', '#00796B'],
  ['#9CCC65', '#558B2F'],
  ['#4DB6AC', '#00897B'],
  ['#81C784', '#388E3C'],
  ['#A5D6A7', '#43A047'],
];

function hashIndex(key, mod) {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export default function PlantTile({
  name,
  imageUrl = null,       // future: server-provided plant photo
  size = 56,
  icon = 'leaf',
  radius,
  style,
}) {
  const { theme } = useTheme();
  const r = radius ?? theme.radius.md;
  const colors = TILE_GRADIENTS[hashIndex(name, TILE_GRADIENTS.length)];

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[{ width: size, height: size, borderRadius: r, backgroundColor: theme.colors.skeleton }, style]}
        contentFit="cover"
        transition={250}
      />
    );
  }

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size, borderRadius: r }, style]}
    >
      <Ionicons name={icon} size={size * 0.5} color="rgba(255,255,255,0.95)" />
      <View style={[styles.gloss, { borderRadius: r }]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.10)',
    height: '45%',
  },
});
