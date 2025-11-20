import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import BalanceScreen from './src/screens/BalanceScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import { AuthContext } from './src/context/AuthContext';
import { api } from './src/services/api';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Главная' }}
      />
      <Tab.Screen 
        name="Balance" 
        component={BalanceScreen}
        options={{ title: 'Баланс' }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ title: 'История' }}
      />
      <Tab.Screen 
        name="Analytics" 
        component={AnalyticsScreen}
        options={{ title: 'Аналитика' }}
      />
      <Tab.Screen 
        name="Services" 
        component={ServicesScreen}
        options={{ title: 'Услуги' }}
      />
      <Tab.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ title: 'Уведомления' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  useEffect(() => {
    // Проверяем сохранённый токен
    AsyncStorage.getItem('userToken').then(token => {
      setUserToken(token);
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      setIsLoading(false);
    });
  }, []);

  const authContext = {
    signIn: async (token) => {
      await AsyncStorage.setItem('userToken', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUserToken(token);
    },
    signOut: async () => {
      await AsyncStorage.removeItem('userToken');
      delete api.defaults.headers.common['Authorization'];
      setUserToken(null);
    },
    signUp: async (token) => {
      await AsyncStorage.setItem('userToken', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUserToken(token);
    }
  };

  if (isLoading) {
    return null; // Можно добавить splash screen
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {userToken == null ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

