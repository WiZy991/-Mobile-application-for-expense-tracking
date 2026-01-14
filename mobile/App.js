import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { AuthContext } from './src/context/AuthContext';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import BalanceScreen from './src/screens/BalanceScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LoginScreen from './src/screens/LoginScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SbisDiagnosticsScreen from './src/screens/SbisDiagnosticsScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { api } from './src/services/api';
import colors from './src/theme/colors';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Компонент иконки для таба
function TabIcon({ icon, focused }) {
  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
      <Text style={styles.tabIcon}>{icon}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: colors.textLight,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: colors.backgroundWhite,
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Главная',
          tabBarLabel: 'Главная',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          title: 'Услуги',
          tabBarLabel: 'Услуги',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.textLight,
          tabBarIcon: ({ focused }) => <TabIcon icon="🛒" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'История',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.textLight,
          tabBarIcon: ({ focused }) => <TabIcon icon="📜" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Уведомления',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.textLight,
          tabBarIcon: ({ focused }) => <TabIcon icon="🔔" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Ещё',
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.textLight,
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Splash Screen компонент
function SplashScreen() {
  return (
    <View style={styles.splashContainer}>
      <View style={styles.splashLogo}>
        <Text style={styles.splashLogoText}>W</Text>
      </View>
      <Text style={styles.splashBrand}>WorldCashBox</Text>
      <Text style={styles.splashTagline}>Автоматизация бизнеса</Text>
    </View>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  useEffect(() => {
    // Проверяем сохранённый токен
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUserToken(token);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        // Небольшая задержка для показа splash screen
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    };

    checkAuth();
  }, []);

  const authContext = {
    signIn: async (token) => {
      try {
        await AsyncStorage.setItem('userToken', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUserToken(token);
      } catch (error) {
        console.error('Sign in error:', error);
      }
    },
    signOut: async () => {
      try {
        await AsyncStorage.removeItem('userToken');
        delete api.defaults.headers.common['Authorization'];
        setUserToken(null);
      } catch (error) {
        console.error('Sign out error:', error);
      }
    },
    signUp: async (token) => {
      try {
        await AsyncStorage.setItem('userToken', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUserToken(token);
      } catch (error) {
        console.error('Sign up error:', error);
      }
    },
    logout: async () => {
      try {
        await AsyncStorage.removeItem('userToken');
        delete api.defaults.headers.common['Authorization'];
        setUserToken(null);
      } catch (error) {
        console.error('Logout error:', error);
      }
    },
  };

  if (isLoading) {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen />
      </>
    );
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <StatusBar style={userToken ? 'light' : 'dark'} />
        <Stack.Navigator 
          screenOptions={{ 
            headerShown: false,
            cardStyle: { backgroundColor: colors.background },
          }}
        >
          {userToken == null ? (
            <>
              <Stack.Screen 
                name="Login" 
                component={LoginScreen}
                options={{
                  animationTypeForReplace: 'pop',
                }}
              />
              <Stack.Screen 
                name="Register" 
                component={RegisterScreen}
                options={{
                  animationTypeForReplace: 'push',
                }}
              />
            </>
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                  headerShown: true,
                  title: 'Профиль',
                  headerBackTitle: 'Назад',
                  headerStyle: {
                    backgroundColor: colors.primary,
                  },
                  headerTintColor: colors.textLight,
                  headerTitleStyle: {
                    fontWeight: '600',
                  },
                }}
              />
              <Stack.Screen
                name="Balance"
                component={BalanceScreen}
                options={{
                  headerShown: true,
                  title: 'Баланс',
                  headerBackTitle: 'Назад',
                  headerStyle: {
                    backgroundColor: colors.primary,
                  },
                  headerTintColor: colors.textLight,
                  headerTitleStyle: {
                    fontWeight: '600',
                  },
                }}
              />
              <Stack.Screen
                name="Analytics"
                component={AnalyticsScreen}
                options={{
                  headerShown: true,
                  title: 'Аналитика',
                  headerBackTitle: 'Назад',
                  headerStyle: {
                    backgroundColor: colors.primary,
                  },
                  headerTintColor: colors.textLight,
                  headerTitleStyle: {
                    fontWeight: '600',
                  },
                }}
              />
              <Stack.Screen
                name="SbisDiagnostics"
                component={SbisDiagnosticsScreen}
                options={{
                  headerShown: true,
                  title: 'Диагностика СБИС',
                  headerBackTitle: 'Назад',
                  headerStyle: {
                    backgroundColor: colors.primary,
                  },
                  headerTintColor: colors.textLight,
                  headerTitleStyle: {
                    fontWeight: '600',
                  },
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  splashLogoText: {
    fontSize: 50,
    fontWeight: 'bold',
    color: colors.textLight,
  },
  splashBrand: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textLight,
    marginBottom: 8,
  },
  splashTagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  tabIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconContainerActive: {
    backgroundColor: colors.primaryLight + '20',
  },
  tabIcon: {
    fontSize: 22,
  },
});
