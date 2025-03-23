import { useState } from 'react';
import { Layout, Menu } from 'antd';
import NewNotes from '../components/Notes/NewNotes'; // Import NewNote component
import ManageNotes from '../components/Notes/ManageNotes'; // Import ManageNotes component

const { Content } = Layout;

function Notes() {
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
        <h1>Notes</h1>

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

        {/* Render NewNote or ManageNotes based on active tab */}
        {activeTab === 'new' && <NewNotes />}
        {activeTab === 'manage' && <ManageNotes />}
      </Content>
    </Layout>
  );
}

export default Notes;
