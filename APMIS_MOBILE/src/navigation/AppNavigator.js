import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import DeviceListScreen from '../screens/DeviceListScreen';
import DeviceDashboardScreen from '../screens/DeviceDashboardScreen';
import AddPlantScreen from '../screens/AddPlantScreen';
import CreateCustomPlantScreen from '../screens/CreateCustomPlantScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, authLoading } = usePump();
  const { theme } = useTheme();

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.bg },
    headerShadowVisible: false,
    headerTintColor: theme.colors.primary,
    headerTitleStyle: { color: theme.colors.text, fontWeight: '700', fontSize: 18 },
    headerBackTitleVisible: false,
    contentStyle: { backgroundColor: theme.colors.bg },
    animation: 'slide_from_right',
  };

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {user ? (
        <>
          <Stack.Screen name="DeviceList" component={DeviceListScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="DeviceDashboard"
            component={DeviceDashboardScreen}
            options={({ route }) => ({ title: route.params?.deviceName ?? 'Device' })}
          />
          <Stack.Screen name="AddPlant" component={AddPlantScreen} options={{ title: 'Add Plant' }} />
          <Stack.Screen name="CreateCustomPlant" component={CreateCustomPlantScreen} options={{ title: 'New Plant Type' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
