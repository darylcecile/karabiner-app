import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { SystemSymbol } from "../../components/SystemSymbol";
import { colors } from "../../styles/theme";

type TabIconProps = {
  color: string;
  focused: boolean;
  fallback: string;
  name: string;
  selectedName?: string;
};

function TabIcon({ color, focused, fallback, name, selectedName }: TabIconProps) {
  return (
    <SystemSymbol
      color={color}
      fallback={fallback}
      name={focused ? selectedName ?? name : name}
      size={focused ? 23 : 22}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerShadowVisible: false,
        headerTitleStyle: styles.headerTitle,
        tabBarActiveTintColor: "#0a84ff",
        tabBarInactiveTintColor: "#8e8e93",
        tabBarLabelStyle: styles.tabBarLabelStyle,
        tabBarStyle: styles.tabBar
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              fallback="•••"
              focused={focused}
              name="bubble.left.and.bubble.right"
              selectedName="bubble.left.and.bubble.right.fill"
            />
          )
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} fallback="✦" focused={focused} name="sparkles" />
          )
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              fallback="⚙︎"
              focused={focused}
              name="gearshape"
              selectedName="gearshape.fill"
            />
          )
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.appBackground
  },
  headerTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "700"
  },
  tabBar: {
    backgroundColor: colors.elevatedBackground,
    borderTopColor: colors.separator
  },
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: "600"
  }
});
