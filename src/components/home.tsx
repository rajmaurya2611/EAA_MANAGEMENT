// src/App.jsx
import { useState } from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import Dashboard from '../components/dashboard';
import Dashboard2 from '../components/dashboard2';

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('dashboard'); // default view

  // Array of nav items with keys "dashboard" and "dashboard2"
  const navItems = [
    { key: 'dashboard', label: 'dashboard', icon: <UserOutlined /> },
    { key: 'dashboard2', label: 'dashboard2', icon: <VideoCameraOutlined /> },
  ];

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside
        className={`bg-gray-800 text-white transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        } flex flex-col`}
      >
        <div className="p-4">
          <h1 className="text-center text-xl font-bold">
            {!collapsed ? 'Logo' : 'L'}
          </h1>
        </div>
        <nav className="flex-1">
          <ul>
            {navItems.map((item) => (
              <li
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`flex items-center p-4 cursor-pointer hover:bg-gray-700 ${
                  activeView === item.key ? 'bg-gray-700' : ''
                }`}
              >
                {item.icon}
                {!collapsed && <span className="ml-2 capitalize">{item.label}</span>}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between bg-gray-100 p-4 border-b border-gray-300">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xl focus:outline-none"
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <div className="font-semibold">Header</div>
          <div></div>
        </header>

        {/* Content */}
        <main className="flex-1 bg-gray-50 overflow-auto p-6">
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'dashboard2' && <Dashboard2 />}
        </main>
      </div>
    </div>
  );
};

export default App;
