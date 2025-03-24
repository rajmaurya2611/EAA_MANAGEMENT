import React, { useState, useEffect } from 'react';
import { Layout, Menu, Spin, Button, Modal, Form, Input, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';

const { Sider, Content } = Layout;

interface BranchNotes {
  branch: string;
  notes: { [noteId: string]: any };
}

const SecondYearNotes: React.FC = () => {
  const [branches, setBranches] = useState<BranchNotes[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<number>(1); // 1: Branch name, 2: Subject details
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [formStep1] = Form.useForm();
  const [formStep2] = Form.useForm();

  // Listen for branches at the specified path
  useEffect(() => {
    const notesRef = dbRef(db, 'version12/Materials/Notes/Second_Year');
    const unsubscribe = onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const branchList: BranchNotes[] = Object.keys(data).map((branch) => ({
          branch,
          notes: data[branch],
        }));
        setBranches(branchList);
        if (branchList.length > 0 && !selectedBranch) {
          setSelectedBranch(branchList[0].branch);
        }
      } else {
        setBranches([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedBranch]);

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedBranch(key);
  };

  // Modal Step 1: Enter Branch Name
  const onFinishStep1 = (values: any) => {
    const branchName = values.branchName.trim();
    if (!branchName) {
      message.error('Please enter a valid branch name.');
      return;
    }
    setNewBranchName(branchName);
    // Proceed to step 2
    setModalStep(2);
  };

  // Modal Step 2: Enter Subject Details
  const onFinishStep2 = async (values: any) => {
    const { pdf, sub_code, sub_name } = values;
    if (!pdf || !sub_code || !sub_name) {
      message.error('Please fill all the required fields.');
      return;
    }
    // Capture current date
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    // The path for the new subject will be:
    // version12/Materials/Notes/Second_Year/<newBranchName>
    const branchPath = `version12/Materials/Notes/Second_Year/${newBranchName}`;
    const newSubjectRef = push(dbRef(db, branchPath));
    const newSubjectId = newSubjectRef.key;
    const subjectData = {
      by: 'admin',
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newSubjectId,
      pdf,
      sub_code,
      sub_name,
    };

    try {
      await set(newSubjectRef, subjectData);
      message.success('Subject added successfully!');
      setShowAddSubjectModal(true);
      // Reset modal after submission
      setTimeout(() => {
        formStep1.resetFields();
        formStep2.resetFields();
        setModalStep(1);
        setShowAddSubjectModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject');
    }
  };

  // Modal cancel resets both steps
  const handleModalCancel = () => {
    setShowAddSubjectModal(false);
    setModalStep(1);
    formStep1.resetFields();
    formStep2.resetFields();
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>
      <Sider width={250} style={{ background: '#fff', paddingBottom: '24px' }}>
        {loading ? (
          <Spin style={{ margin: '20px' }} />
        ) : (
          <>
            <Menu
              mode="inline"
              selectedKeys={[selectedBranch]}
              onClick={handleMenuClick}
              style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
            >
              {branches.map((branchObj) => (
                <Menu.Item key={branchObj.branch}>{branchObj.branch}</Menu.Item>
              ))}
            </Menu>
            <Button
              type="dashed"
              style={{ width: '90%', margin: '10px' }}
              onClick={() => setShowAddSubjectModal(true)}
            >
              Add Subject
            </Button>
          </>
        )}
      </Sider>
      <Layout style={{ padding: '24px' }}>
        <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          {/* Content area intentionally left empty */}
        </Content>
      </Layout>

      {/* Modal for adding a new subject */}
      <Modal
        open={showAddSubjectModal}
        title="Add New Subject"
        onCancel={handleModalCancel}
        footer={null}
      >
        {modalStep === 1 && (
          <Form form={formStep1} layout="vertical" onFinish={onFinishStep1}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter the branch name' }]}
            >
              <Input placeholder="Enter branch name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Next
              </Button>
            </Form.Item>
          </Form>
        )}
        {modalStep === 2 && (
          <Form form={formStep2} layout="vertical" onFinish={onFinishStep2}>
            <Form.Item
              label="PDF Link"
              name="pdf"
              rules={[{ required: true, message: 'Please enter the PDF link' }]}
            >
              <Input placeholder="Enter PDF link" />
            </Form.Item>
            <Form.Item
              label="Subject Code"
              name="sub_code"
              rules={[{ required: true, message: 'Please enter the subject code' }]}
            >
              <Input placeholder="Enter subject code" />
            </Form.Item>
            <Form.Item
              label="Subject Name"
              name="sub_name"
              rules={[{ required: true, message: 'Please enter the subject name' }]}
            >
              <Input placeholder="Enter subject name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add Subject
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Layout>
  );
};

export default SecondYearNotes;
