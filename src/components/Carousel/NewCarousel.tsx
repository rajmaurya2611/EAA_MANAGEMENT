import  { useState } from 'react';
import { Layout, Menu } from 'antd';
import Template1 from './Template1';

const { Sider, Content } = Layout;

function NewCarousel() {
  const [selectedTemplate, setSelectedTemplate] = useState('template1'); // Default to Template 1

  // Handle the selection of a template from the sidebar
  const handleMenuClick = (e: any) => {
    setSelectedTemplate(e.key);
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>

      <Layout>
        {/* Sidebar */}
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedTemplate]} // Set the active template
            onClick={handleMenuClick} // Handle sidebar item click
            style={{ height: '100%', borderRight: 0 }}
          >
            <Menu.Item key="template1">Template 1</Menu.Item>
            <Menu.Item key="template2">Template 2</Menu.Item>
            <Menu.Item key="template3">Template 3</Menu.Item>
          </Menu>
        </Sider>

        {/* Content Area */}
        <Layout style={{ padding: '0 24px 24px' }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: '#fff',
            }}
          >
            {selectedTemplate === 'template1' && (
              <Template1/>
            )}

            {selectedTemplate === 'template2' && (
              <div>
                <h3>Template 2 Content</h3>
                {/* Add content for Template 2 */}
              </div>
            )}

            {selectedTemplate === 'template3' && (
              <div>
                <h3>Template 3 Content</h3>
                {/* Add content for Template 3 */}
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

export default NewCarousel;
