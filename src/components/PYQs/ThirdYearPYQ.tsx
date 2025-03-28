import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Spin,
  Button,
  Modal,
  Form,
  Input,
  message,
} from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;

const PYQ_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// Encryption function for text fields
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(PYQ_AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return plainText;
  }
};

interface BranchPyqs {
  branch: string;
  // Each branch contains year nodes, e.g. "2020-2019", each holding subject notes
  pyqs: { [year: string]: { [noteId: string]: any } };
}

const ThirdYearPYQ: React.FC = () => {
  const [branches, setBranches] = useState<BranchPyqs[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // ----------------------- Existing Modal: Add Year -----------------------
  const [showAddYearModal, setShowAddYearModal] = useState<boolean>(false);
  const [addYearModalStep, setAddYearModalStep] = useState<number>(1);
  const [newYear, setNewYear] = useState<string>('');
  const [yearModalForm] = Form.useForm();

  // ----------------------- Modified "Add Branch" Modal -----------------------
  // (Previously the "Add Subject" modal)
  const [showAddBranchModal, setShowAddBranchModal] = useState<boolean>(false);
  // modalStep: 1 = branch name, 2 = year name, 3 = form details
  const [modalStep, setModalStep] = useState<number>(1);
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [newYearForBranch, setNewYearForBranch] = useState<string>('');
  // Separate form instances for each step:
  const [branchNameForm] = Form.useForm();
  const [branchYearForm] = Form.useForm();
  const [branchDetailsForm] = Form.useForm();

  // ----------------------- Existing Content Area Form -----------------------
  const [subjectForm] = Form.useForm();
  const [showSubjectSuccessModal, setShowSubjectSuccessModal] = useState<boolean>(false);

  // ----------------------- Data Listener -----------------------
  useEffect(() => {
    const PyqsRef = dbRef(db, 'version12/Materials/Pyq/Third_Year');
    const unsubscribe = onValue(PyqsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const branchList: BranchPyqs[] = Object.keys(data).map((branch) => ({
          branch,
          pyqs: data[branch],
        }));
        setBranches(branchList);
        // Default to Third branch and its Third year if nothing is selected.
        if (branchList.length > 0 && !selectedBranch) {
          setSelectedBranch(branchList[0].branch);
          const years = Object.keys(branchList[0].pyqs);
          if (years.length > 0) {
            setSelectedYear(years[0]);
          }
        }
      } else {
        setBranches([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedBranch]);

  // ----------------------- Menu Click Handler -----------------------
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key.endsWith('-add-year')) {
      const branch = key.substring(0, key.length - '-add-year'.length);
      setSelectedBranch(branch);
      setShowAddYearModal(true);
      setAddYearModalStep(1);
      return;
    }
    // Assume key is in the format "branch-year" (year may include dashes)
    const separatorIndex = key.indexOf('-');
    if (separatorIndex !== -1) {
      const branch = key.substring(0, separatorIndex);
      const year = key.substring(separatorIndex + 1);
      setSelectedBranch(branch);
      setSelectedYear(year);
    }
  };

  // ----------------------- Modified "Add Branch" Modal Handlers -----------------------

  // Step 1: Ask for branch name.
  const onFinishBranchStep1 = (values: any) => {
    const branchName = values.branchName.trim();
    if (!branchName) {
      message.error('Please enter a valid branch name.');
      return;
    }
    setNewBranchName(branchName);
    setModalStep(2);
  };

  // Step 2: Ask for the year name.
  const onFinishBranchStep2 = (values: any) => {
    const yearValue = values.year.trim();
    if (!yearValue) {
      message.error('Please enter a valid year.');
      return;
    }
    setNewYearForBranch(yearValue);
    setModalStep(3);
  };

  // Step 3: Ask for form details and save branch with its initial subject note.
  const onFinishBranchStep3 = async (values: any) => {
    const { by, pdf, sub_code, sub_name } = values;
    if (!by || !pdf || !sub_code || !sub_name) {
      message.error('Please fill in all the required fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    // Create branch under newBranchName and newYearForBranch.
    const branchPath = `version12/Materials/Pyq/Third_Year/${newBranchName}/${newYearForBranch}`;
    const newSubjectRef = push(dbRef(db, branchPath));
    const newSubjectId = newSubjectRef.key;
    const subjectData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newSubjectId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newSubjectRef, subjectData);
      message.success('Branch added successfully!');
      // Update selected branch/year to the newly added ones.
      setSelectedBranch(newBranchName);
      setSelectedYear(newYearForBranch);
      // Reset the modal state.
      setTimeout(() => {
        branchNameForm.resetFields();
        branchYearForm.resetFields();
        branchDetailsForm.resetFields();
        setModalStep(1);
        setShowAddBranchModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add branch.');
    }
  };

  const handleAddBranchModalCancel = () => {
    setShowAddBranchModal(false);
    setModalStep(1);
    branchNameForm.resetFields();
    branchYearForm.resetFields();
    branchDetailsForm.resetFields();
  };

  // ----------------------- Existing Content Area Form Handler -----------------------
  const onFinishSubject = async (values: any) => {
    if (!selectedBranch || !selectedYear) {
      message.error('Please select a branch and a year.');
      return;
    }
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill in all fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    const branchPath = `version12/Materials/Pyq/Third_Year/${selectedBranch}/${selectedYear}`;
    const newNoteRef = push(dbRef(db, branchPath));
    const newNoteId = newNoteRef.key;
    const noteData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newNoteId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newNoteRef, noteData);
      message.success('Subject note added successfully!');
      setShowSubjectSuccessModal(true);
      setTimeout(() => {
        subjectForm.resetFields();
        setShowSubjectSuccessModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject note.');
    }
  };

  const onSubjectCancel = () => {
    subjectForm.resetFields();
  };

  // ----------------------- Existing "Add Year" Modal Handlers -----------------------
  const onFinishAddYearStep1 = (values: any) => {
    const yearValue = values.year.trim();
    if (!yearValue) {
      message.error('Please enter a valid year.');
      return;
    }
    setNewYear(yearValue);
    setAddYearModalStep(2);
  };

  const onFinishAddYearStep2 = async (values: any) => {
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill all the required fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    const branchPath = `version12/Materials/Pyq/Third_Year/${selectedBranch}/${newYear}`;
    const newNoteRef = push(dbRef(db, branchPath));
    const newNoteId = newNoteRef.key;
    const noteData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newNoteId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newNoteRef, noteData);
      message.success('Year added successfully with its subject note!');
      setSelectedYear(newYear);
      setTimeout(() => {
        yearModalForm.resetFields();
        setAddYearModalStep(1);
        setShowAddYearModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add year.');
    }
  };

  const handleAddYearModalCancel = () => {
    setShowAddYearModal(false);
    setAddYearModalStep(1);
    yearModalForm.resetFields();
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>
      <Sider width={300} style={{ background: '#fff', paddingBottom: '24px' }}>
        <Spin spinning={loading} style={{ margin: '20px' }}>
          <Menu
            mode="inline"
            selectedKeys={[`${selectedBranch}-${selectedYear}`]}
            onClick={handleMenuClick}
            style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
          >
            {branches.map((branchObj) => (
              <Menu.SubMenu key={branchObj.branch} title={branchObj.branch}>
                {branchObj.pyqs &&
                  Object.keys(branchObj.pyqs).map((year) => (
                    <Menu.Item key={`${branchObj.branch}-${year}`}>{year}</Menu.Item>
                  ))}
                <Menu.Item key={`${branchObj.branch}-add-year`}>Add Year</Menu.Item>
              </Menu.SubMenu>
            ))}
          </Menu>
          <Button
            type="dashed"
            style={{ width: '90%', margin: '10px' }}
            onClick={() => {
              setShowAddBranchModal(true);
              setModalStep(1);
            }}
          >
            Add Branch
          </Button>
        </Spin>
      </Sider>
      <Layout style={{ padding: '24px' }}>
        <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <h2>
            You are uploading to <strong>{selectedBranch}</strong> year{' '}
            <strong>{selectedYear}</strong>
          </h2>
          <Form
            form={subjectForm}
            layout="vertical"
            onFinish={onFinishSubject}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>
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
                Add Subject Note
              </Button>
              <Button onClick={onSubjectCancel} style={{ marginLeft: '10px' }}>
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Content>
      </Layout>

      {/* ----------------------- "Add Branch" Modal (Modified) ----------------------- */}
      <Modal
        open={showAddBranchModal}
        title="Add New Branch"
        onCancel={handleAddBranchModalCancel}
        footer={null}
      >
        {modalStep === 1 && (
          <Form form={branchNameForm} layout="vertical" onFinish={onFinishBranchStep1}>
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
          <Form form={branchYearForm} layout="vertical" onFinish={onFinishBranchStep2}>
            <Form.Item
              label="Year"
              name="year"
              rules={[{ required: true, message: 'Please enter the year' }]}
            >
              <Input placeholder="Enter year (e.g., 2020-2019)" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Next
              </Button>
            </Form.Item>
          </Form>
        )}
        {modalStep === 3 && (
          <Form
            form={branchDetailsForm}
            layout="vertical"
            onFinish={onFinishBranchStep3}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>
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
                Add Branch
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ----------------------- "Add Year" Modal (Unchanged) ----------------------- */}
      <Modal
        open={showAddYearModal}
        title="Add New Year"
        onCancel={handleAddYearModalCancel}
        footer={null}
      >
        {addYearModalStep === 1 && (
          <Form form={yearModalForm} layout="vertical" onFinish={onFinishAddYearStep1}>
            <Form.Item
              label="Year"
              name="year"
              rules={[{ required: true, message: 'Please enter the year' }]}
            >
              <Input placeholder="Enter year (e.g., 2022-2023)" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Next
              </Button>
            </Form.Item>
          </Form>
        )}
        {addYearModalStep === 2 && (
          <Form
            form={yearModalForm}
            layout="vertical"
            onFinish={onFinishAddYearStep2}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>
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
                Add Year
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ----------------------- Success Modal for Subject Note Addition ----------------------- */}
      <Modal
        open={showSubjectSuccessModal}
        title="Success"
        onOk={() => setShowSubjectSuccessModal(false)}
        onCancel={() => setShowSubjectSuccessModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowSubjectSuccessModal(false)}>
            OK
          </Button>,
        ]}
      >
        <p>Your subject note has been added successfully!</p>
      </Modal>
    </Layout>
  );
};

export default ThirdYearPYQ;
