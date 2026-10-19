import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import FirstYearQuantums from '../../components/Quantums/FirstYearQuantums';
import SecondYearQuantums from '../../components/Quantums/SecondYearQuantums';
import ThirdYearQuantums from '../../components/Quantums/ThirdYearQuantums';
import FourthYearQuantums from '../../components/Quantums/FourthYearQuantums';

const { Content } = Layout;

const NewQuantums: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('first'); // Default to 1st Year

  const handleMenuClick = ({ key }: { key: string }) => {
    setActiveTab(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ margin: '16px', padding: '20px', background: '#fff', borderRadius: '8px' }}>
        <h1>Quantums</h1>
        {/* Horizontal Navbar for 1st, 2nd, 3rd, and 4th Year */}
        <Menu
          mode="horizontal"
          selectedKeys={[activeTab]}
          onClick={handleMenuClick}
          style={{ marginBottom: '20px' }}
        >
          <Menu.Item key="first">1st Year</Menu.Item>
          <Menu.Item key="second">2nd Year</Menu.Item>
          <Menu.Item key="third">3rd Year</Menu.Item>
          <Menu.Item key="fourth">4th Year</Menu.Item>
        </Menu>

        {/* Render respective component based on selected year */}
        {activeTab === 'first' && <FirstYearQuantums />}
        {activeTab === 'second' && <SecondYearQuantums />}
        {activeTab === 'third' && <ThirdYearQuantums />}
        {activeTab === 'fourth' && <FourthYearQuantums />}
      </Content>
    </Layout>
  );
};

export default NewQuantums;
