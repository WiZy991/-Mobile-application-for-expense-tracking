import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, BackHandler, Platform } from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthContext } from './src/context/AuthContext';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import BalanceScreen from './src/screens/BalanceScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LoginScreen from './src/screens/LoginScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import StaffDashboardScreen from './src/screens/StaffDashboardScreen';
import StaffAnalyticsScreen from './src/screens/StaffAnalyticsScreen';
import StaffNotificationsScreen from './src/screens/StaffNotificationsScreen';
import TicketDetailScreen from './src/screens/TicketDetailScreen';
import ClientTicketDetailScreen from './src/screens/ClientTicketDetailScreen';
import ChatScreen from './src/screens/ChatScreen';
import SbisDiagnosticsScreen from './src/screens/SbisDiagnosticsScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SupportScreen from './src/screens/SupportScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import TermsScreen from './src/screens/TermsScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import MyServicesScreen from './src/screens/MyServicesScreen';
import ResourcesScreen from './src/screens/ResourcesScreen';
import SubscriptionsScreen from './src/screens/SubscriptionsScreen';
import { api, sbisAuth } from './src/services/api';
import { SBIS_CONFIG, isSbisConfigured } from './src/config/sbisConfig';
import colors from './src/theme/colors';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Компонент иконки для таба
function TabIcon({ iconName, iconLibrary = 'MaterialIcons', focused }) {
  const IconComponent = iconLibrary === 'Ionicons' ? Ionicons : 
                        iconLibrary === 'FontAwesome5' ? FontAwesome5 :
                        iconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons :
                        MaterialIcons;
  return (
    <IconComponent 
      name={iconName} 
      size={24} 
      color={focused ? colors.primary : colors.textMuted} 
    />
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
          tabBarIcon: ({ focused }) => <TabIcon iconName="home" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon iconName="shopping-cart" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon iconName="history" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon iconName="notifications" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon iconName="settings" focused={focused} />,
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
  const [userType, setUserType] = useState(null); // 'client' или 'staff'
  const [userRole, setUserRole] = useState(null); // 'support' (для staff)
  const navigationRef = useRef(null);

  // Обработчик кнопки "Назад" на Android
  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Проверяем, можно ли вернуться назад в навигации
        if (navigationRef.current?.isReady() && navigationRef.current?.canGoBack()) {
          navigationRef.current.goBack();
          return true; // Предотвращаем закрытие приложения
        }
        // Если нельзя вернуться назад, разрешаем стандартное поведение (закрытие приложения)
        return false;
      });

      return () => backHandler.remove();
    }
  }, []);

  useEffect(() => {
    // Проверяем сохранённый токен и тип пользователя
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const type = await AsyncStorage.getItem('userType');
        const role = await AsyncStorage.getItem('userRole');
        
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUserToken(token);
          setUserType(type);
          setUserRole(role);
        }

        // Автоматическая авторизация в СБИС при старте приложения
        // Это обеспечит загрузку всех данных из СБИС
        if (isSbisConfigured() && !SBIS_CONFIG.demoMode) {
          try {
            console.log('🔐 Автоматическая авторизация в СБИС...');
            const sbisAuthResult = await sbisAuth(SBIS_CONFIG.login, SBIS_CONFIG.password);
            if (sbisAuthResult.success) {
              console.log('✅ СБИС авторизован:', {
                online: !!sbisAuthResult.sessionId,
                spp: !!sbisAuthResult.sppSessionId,
              });
            } else {
              console.log('⚠️ СБИС авторизация не удалась:', sbisAuthResult.error);
            }
          } catch (sbisError) {
            // Игнорируем ошибки сети при авторизации СБИС
            if (sbisError.code === 'ERR_NETWORK' || sbisError.message?.includes('Network Error')) {
              console.log('⚠️ Сервер недоступен, пропускаем авторизацию СБИС');
            } else {
              console.log('⚠️ Ошибка авторизации СБИС:', sbisError.message);
            }
            // Не блокируем запуск приложения, если СБИС недоступен
          }
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
    signIn: async (token, type = 'client', role = null) => {
      try {
        await AsyncStorage.setItem('userToken', token);
        if (type) await AsyncStorage.setItem('userType', type);
        if (role) await AsyncStorage.setItem('userRole', role);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUserToken(token);
        setUserType(type);
        setUserRole(role);
      } catch (error) {
        console.error('Sign in error:', error);
      }
    },
    signOut: async () => {
      try {
        // Очищаем все данные пользователя
        await AsyncStorage.multiRemove([
          'userToken',
          'userType',
          'userRole',
          'userBalance',
          'transactions',
          'clientData'
        ]);
        delete api.defaults.headers.common['Authorization'];
        setUserToken(null);
        setUserType(null);
        setUserRole(null);
        console.log('User signed out successfully');
      } catch (error) {
        console.error('Sign out error:', error);
        // Даже если есть ошибка, все равно очищаем токен
        setUserToken(null);
        setUserType(null);
        setUserRole(null);
      }
    },
    signUp: async (token, type = 'client', role = null) => {
      try {
        await AsyncStorage.setItem('userToken', token);
        if (type) await AsyncStorage.setItem('userType', type);
        if (role) await AsyncStorage.setItem('userRole', role);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUserToken(token);
        setUserType(type);
        setUserRole(role);
      } catch (error) {
        console.error('Sign up error:', error);
      }
    },
    logout: async () => {
      try {
        // Очищаем все данные пользователя
        await AsyncStorage.multiRemove([
          'userToken',
          'userType',
          'userRole',
          'userBalance',
          'transactions',
          'clientData'
        ]);
        delete api.defaults.headers.common['Authorization'];
        setUserToken(null);
        setUserType(null);
        setUserRole(null);
        console.log('User logged out successfully');
      } catch (error) {
        console.error('Logout error:', error);
        // Даже если есть ошибка, все равно очищаем токен
        setUserToken(null);
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
      <NavigationContainer ref={navigationRef}>
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
          ) : userType === 'staff' ? (
            <>
              {/* Кабинет сотрудника (инженер поддержки) */}
              <Stack.Screen 
                name="StaffDashboard" 
                component={StaffDashboardScreen}
                initialParams={{ staffRole: 'support' }}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="StaffAnalytics"
                component={StaffAnalyticsScreen}
                options={{
                  headerShown: true,
                  title: 'Аналитика задач',
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
                name="StaffNotifications"
                component={StaffNotificationsScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen 
                name="TicketDetail" 
                component={TicketDetailScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Chat"
                component={ChatScreen}
                options={{
                  headerShown: false,
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
                  title: 'Диагностика API',
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
                name="ChangePassword"
                component={ChangePasswordScreen}
                options={{
                  headerShown: true,
                  title: 'Изменить пароль',
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
                name="Terms"
                component={TermsScreen}
                options={{
                  headerShown: true,
                  title: 'Пользовательское соглашение',
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
                name="PrivacyPolicy"
                component={PrivacyPolicyScreen}
                options={{
                  headerShown: true,
                  title: 'Политика конфиденциальности',
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
                name="MyServices"
                component={MyServicesScreen}
                options={{
                  headerShown: true,
                  title: 'Мои услуги',
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
                name="Support"
                component={SupportScreen}
                options={{
                  headerShown: true,
                  title: 'Помощь',
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
                name="Resources"
                component={ResourcesScreen}
                options={{
                  headerShown: true,
                  title: 'Мои ресурсы',
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
                name="Subscriptions"
                component={SubscriptionsScreen}
                options={{
                  headerShown: true,
                  title: 'Тарифы и подписки',
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
                name="ClientTicketDetail"
                component={ClientTicketDetailScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Chat"
                component={ChatScreen}
                options={{
                  headerShown: false,
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
