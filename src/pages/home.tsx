import React, { useState } from 'react';
import {
  UserOutlined,
  VideoCameraOutlined,
  AppstoreAddOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Layout, Menu, theme } from 'antd';
import Dashboard from '../components/dashboard';
import Users from './Users';
import Carousel from './Carousel'; // Assume you have a Carousel component
import NewNotes from '../components/Notes/NewNotes';

const { Content, Sider } = Layout;
const { SubMenu } = Menu;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const Home: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // Default view

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <UserOutlined /> },
    { key: 'Users', label: 'Users', icon: <VideoCameraOutlined /> },
    {
      key: 'Homepage',
      label: 'Homepage',
      icon: <VideoCameraOutlined />,
      children: [
        { key: 'carousel', label: 'Carousel', icon: <AppstoreAddOutlined /> },
      ],
    },
    {
      key: 'materials',
      label: 'Materials',
      icon: <AppstoreOutlined />,
      children: [
        {
          key: 'notes',
          label: 'Notes',
          icon: <FileTextOutlined />,
          children: [
            { key: 'notesNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'notesManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
        {
          key: 'quantum',
          label: 'Quantum',
          icon: <AppstoreOutlined />,
          children: [
            { key: 'quantumNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'quantumManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
      ],
    },
  ];

  const handleMenuClick = (key: string) => {
    setActiveView(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ overflowY: 'auto' }}
      >
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          defaultSelectedKeys={['dashboard']}
          mode="inline"
          onClick={({ key }) => handleMenuClick(key)}
        >
          {navItems.map((item) =>
            item.children ? (
              <SubMenu key={item.key} icon={item.icon} title={item.label}>
                {item.children.map((subItem) =>
                  subItem.children ? (
                    <SubMenu key={subItem.key} icon={subItem.icon} title={subItem.label}>
                      {(subItem.children as NavItem[]).map((child: NavItem) => (
                        <Menu.Item key={child.key} icon={child.icon}>
                          {child.label}
                        </Menu.Item>
                      ))}
                    </SubMenu>
                  ) : (
                    <Menu.Item key={subItem.key} icon={subItem.icon}>
                      {subItem.label}
                    </Menu.Item>
                  )
                )}
              </SubMenu>
            ) : (
              <Menu.Item key={item.key} icon={item.icon}>
                {item.label}
              </Menu.Item>
            )
          )}
        </Menu>
      </Sider>

      {/* Main Layout Content */}
      <Layout>
        <Content
          style={{
            margin: '0',
            paddingTop: 0,
            overflowY: 'auto',
            height: '100vh',
          }}
        >
          <div
            style={{
              padding: 0,
              minHeight: 360,
              background: colorBgContainer,
              overflowY: 'auto',
              maxHeight: '100vh',
            }}
          >
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'Users' && <Users />}
            {activeView === 'carousel' && <Carousel />}
            {activeView === 'notesNew' && <NewNotes />}
            {activeView === 'notesManage' && <div>Manage Notes content here</div>}
            {activeView === 'quantumNew' && <div>New Quantum content here</div>}
            {activeView === 'quantumManage' && <div>Manage Quantum content here</div>}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Home;
