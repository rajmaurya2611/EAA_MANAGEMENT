import { useState } from 'react';
import { Layout, Menu } from 'antd';
import NewInterviewQuestions from './newinterview_question'; // Import NewCarousel component
import ManageInterviewQuestions from './manageinterview_question'; // Import ManageCarousel component

const { Content } = Layout;

function InterviewQuestions() {
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
        <h1>Interview Questions</h1>

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
        {activeTab === 'new' && <NewInterviewQuestions />}
        {activeTab === 'manage' && <ManageInterviewQuestions/>}
      </Content>
    </Layout>
  );
}

export default InterviewQuestions;
