import { useState } from 'react';
import { UserOutlined, VideoCameraOutlined, AppstoreAddOutlined } from '@ant-design/icons';
import { Layout, Menu, theme } from 'antd';
import Dashboard from '../components/dashboard';
import Users from './Users';
import Carousel from './Carousel'; // Assume you have a Carousel component

const { Content, Sider } = Layout;
const { SubMenu } = Menu;

const Home: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // Default view

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <UserOutlined /> },
    { key: 'Users', label: 'Users', icon: <VideoCameraOutlined /> },
    { key: 'Homepage', label: 'Homepage', icon: <VideoCameraOutlined />, children: [
      { key: 'carousel', label: 'Carousel', icon: <AppstoreAddOutlined /> },
    ]}
  ];

  const handleMenuClick = (key: string) => {
    if (key === 'Homepage') {
      setActiveView('carousel'); // Default to 'carousel' view when "Homepage" is clicked
    } else {
      setActiveView(key); // Otherwise, set the active view to the clicked menu item
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar with scroll */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ overflowY: 'auto' }} // Make sidebar scrollable
      >
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          defaultSelectedKeys={['dashboard']}
          mode="inline"
          onClick={({ key }) => handleMenuClick(key)}
        >
          {navItems.map((item) => (
            item.children ? (
              <SubMenu key={item.key} icon={item.icon} title={item.label}>
                {item.children.map((subItem) => (
                  <Menu.Item key={subItem.key} icon={subItem.icon}>
                    {subItem.label}
                  </Menu.Item>
                ))}
              </SubMenu>
            ) : (
              <Menu.Item key={item.key} icon={item.icon}>
                {item.label}
              </Menu.Item>
            )
          ))}
        </Menu>
      </Sider>

      <Layout>
        {/* Content */}
        <Content
          style={{
            margin: '0',
            paddingTop: 0, // Add some padding at the top if needed
            overflowY: 'auto', // Allow scrolling
            height: '100vh', // Subtract height of the Header
          }}
        >
          <div
            style={{
              padding: 0,
              minHeight: 360,
              background: colorBgContainer,
              overflowY: 'auto', // Enable scrolling within content if necessary
              maxHeight: '100vh', // Ensure content doesn't overflow past the page
            }}
          >
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'Users' && <Users />}
            {activeView === 'carousel' && <Carousel />} {/* Render Carousel by default */}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Home;
