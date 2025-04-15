import { useState } from 'react';
import { Layout, Menu } from 'antd';
import NewPlacementNotes from './new_placement_notes'; // Import NewCarousel component
import ManagePlacementNotes from './manage_placement_notes'; // Import ManageCarousel component

const { Content } = Layout;

function PlacementNotes() {
  const [activeTab, setActiveTab] = useState('new'); // Track selected tab ('new' or 'manage')

  // Handle click for New and Manage options
  const handleMenuClick = (key: string) => {
    setActiveTab(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Content Section */}
      <Content
        style={{
          margin: '16px',
          padding: '20px',
          background: '#fff',
          borderRadius: '8px',
        }}
      >
        <h1>Placement Notes</h1>

        {/* Minimalistic Navbar with "New" and "Manage" options */}
        <Menu
          mode="horizontal"
          selectedKeys={[activeTab]}
          onClick={({ key }) => handleMenuClick(key)}
          style={{ marginBottom: '20px' }}
        >
          <Menu.Item key="new">New</Menu.Item>
          <Menu.Item key="manage">Manage</Menu.Item>
        </Menu>

        {/* Render NewCarousel or ManageCarousel based on active tab */}
        {activeTab === 'new' && <NewPlacementNotes/>}
        {activeTab === 'manage' && <ManagePlacementNotes/>}
      </Content>
    </Layout>
  );
}

export default PlacementNotes;
