import React, { useEffect, useState } from 'react';
import {
  Layout,
  Breadcrumb,
  Select,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Spin,
} from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Content } = Layout;
const { Option } = Select;
const { TextArea } = Input;

// Use your secret key
const APTITUDE_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// Encrypt sensitive fields
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(APTITUDE_AES_SECRET_KEY);
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

// Recursively build a simple tree structure (options) from Firebase data.
// We assume that if an object has a "question" property, it’s a leaf record.
const buildTreeOptions = (obj: any): any[] => {
  const options: any[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !('question' in val)) {
        options.push({
          key,
          label: key,
          children: buildTreeOptions(val),
        });
      }
    }
  }
  return options;
};

// Given the tree (an array of nested nodes) and a selected path (array of keys),
// return the options (children) for the given level.
const getOptionsForLevel = (tree: any[], level: number, selectedPath: string[]) => {
  if (level === 1) return tree;
  let currentNodes = tree;
  for (let i = 0; i < level - 1; i++) {
    const sel = selectedPath[i];
    const found = currentNodes.find((n: any) => n.key === sel);
    if (!found || !found.children) return [];
    currentNodes = found.children;
  }
  return currentNodes;
};

const FIXED_LEVELS = 4; // Maximum number of tree levels

// Extract the QuestionForm into its own component for reuse.
const QuestionForm = ({ form, onFinish }: { form: any; onFinish: (values: any) => void; }) => (
  <Form
    form={form}
    layout="vertical"
    onFinish={onFinish}
    initialValues={{ time_limit: 60, aptCategory: 'Quantitative' }}
  >
    <Form.Item
      label="Question"
      name="question"
      rules={[{ required: true, message: 'Please enter the question' }]}
    >
      <TextArea rows={3} placeholder="Enter the question" />
    </Form.Item>
    <Form.Item
      label="Options (comma separated)"
      name="options"
      rules={[{ required: true, message: 'Please enter options separated by commas' }]}
    >
      <TextArea rows={2} placeholder="e.g. 12, 15, 27, 30" />
    </Form.Item>
    <Form.Item
      label="Category (e.g. Quantitative)"
      name="aptCategory"
      rules={[{ required: true, message: 'Please enter the aptitude category' }]}
    >
      <Input placeholder="Enter aptitude category" />
    </Form.Item>
    <Form.Item
      label="Correct Answer"
      name="correct_answer"
      rules={[{ required: true, message: 'Please enter the correct answer' }]}
    >
      <Input placeholder="Enter the correct answer" />
    </Form.Item>
    <Form.Item
      label="Explanation"
      name="explanation"
      rules={[{ required: true, message: 'Please enter the explanation' }]}
    >
      <TextArea rows={3} placeholder="Enter explanation" />
    </Form.Item>
    <Form.Item
      label="Time Limit (seconds)"
      name="time_limit"
      rules={[{ required: true, message: 'Please enter the time limit' }]}
    >
      <InputNumber min={1} style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item>
      <Button type="primary" htmlType="submit">
        Add Question
      </Button>
    </Form.Item>
  </Form>
);

const SimpleAptitudeAdminPanel: React.FC = () => {
  // Full tree data loaded from Firebase.
  const [treeOptions, setTreeOptions] = useState<any[]>([]);
  // selectedValues array stores the key selected at each level.
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  // loading flag
  const [loading, setLoading] = useState<boolean>(true);

  // States to control the modal workflow for adding sections.
  // sectionWorkflowLevel === null means no section workflow is active.
  const [sectionWorkflowLevel, setSectionWorkflowLevel] = useState<number | null>(null);
  // Control the question modal for the section workflow.
  const [showAddQuestionModal, setShowAddQuestionModal] = useState<boolean>(false);

  // Added state for the success modal
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Form instances.
  const [sectionForm] = Form.useForm();
  const [questionForm] = Form.useForm();

  // Load the entire tree from Firebase at Placement/Aptitude_Practice.
  useEffect(() => {
    const aptitudeRef = dbRef(db, 'version12/Placement/Aptitude_Practice');
    const unsubscribe = onValue(aptitudeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTreeOptions(buildTreeOptions(data));
      } else {
        setTreeOptions([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handler for when a drop-down value is changed.
  const handleSelectChange = (level: number, value: string) => {
    // Update selectedValues up to the selected level.
    // If a level (e.g. level 2 or beyond) is changed, remove selections for later levels.
    setSelectedValues((prev) => {
      const newSelected = [...prev];
      newSelected[level - 1] = value;
      return newSelected.slice(0, level);
    });
  };

  // Get the Firebase path for a given level.
  // For a drop-down at level L, if a section is added, its parent path is determined by levels 1 to L-1.
  const getFirebasePathForLevel = (level: number): string => {
    if (level === 1) return 'version12/Placement/Aptitude_Practice';
    const parentPath = selectedValues.slice(0, level - 1).join('/');
    return `version12/Placement/Aptitude_Practice/${parentPath}`;
  };

  // Start the section workflow at a given level.
  const onAddSectionClick = (level: number) => {
    // Remove any later selections if user starts a new section workflow from this level.
    setSelectedValues((prev) => prev.slice(0, level - 1));
    setSectionWorkflowLevel(level);
    sectionForm.resetFields();
  };

  // Sequentially submit a new section at the current workflow level.
  const handleSectionWorkflowSubmit = async (values: any) => {
    const { sectionName } = values;
    if (!sectionName?.trim()) {
      message.error('Please enter a valid section name.');
      return;
    }
    const newSection = sectionName.trim();
    // The new section is added as a child of the node at (current workflow level – 1).
    const parentPath = getFirebasePathForLevel(sectionWorkflowLevel!);
    const fullPath = `${parentPath}/${newSection}`;
    try {
      await set(dbRef(db, fullPath), {}); // Create an empty object in Firebase.
      message.success(`Section '${newSection}' added at level ${sectionWorkflowLevel}!`);
      // Update selectedValues at this level.
      setSelectedValues((prev) => {
        const newSel = [...prev];
        newSel[sectionWorkflowLevel! - 1] = newSection;
        return newSel.slice(0, sectionWorkflowLevel!);
      });
      sectionForm.resetFields();
      // If not yet at the last level, advance to the next level.
      if (sectionWorkflowLevel! < FIXED_LEVELS) {
        setSectionWorkflowLevel(sectionWorkflowLevel! + 1);
      } else {
        // Reached level 4: complete the workflow.
        setSectionWorkflowLevel(null);
        // Reset the question form to ensure it opens clean.
        questionForm.resetFields();
        // Open the question modal automatically.
        setShowAddQuestionModal(true);
      }
    } catch (error) {
      console.error(error);
      message.error(`Failed to add section at level ${sectionWorkflowLevel}`);
    }
  };

  // Inline function for handling question submission (used in both flows)
  const handleAddQuestion = async (values: any) => {
    const { question, options, aptCategory, correct_answer, explanation, time_limit } = values;
    if (!question || !options || !aptCategory || !correct_answer || !explanation || !time_limit) {
      message.error('Please fill in all required fields.');
      return;
    }
    const now = new Date().toLocaleDateString();
    // The question is added under the currently selected branch (all 4 levels).
    const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}`;
    const questionRef = push(dbRef(db, path));
    const questionId = questionRef.key;
    const data = {
      id: questionId,
      question: encryptAES(question),
      correct_answer: encryptAES(correct_answer),
      explanation: encryptAES(explanation),
      options: options.split(',').map((o: string) => o.trim()),
      category: aptCategory,
      time_limit,
      date: now,
    };
    try {
      await set(questionRef, data);
      message.success('Question added successfully!');
      questionForm.resetFields();
      // If using the modal (section workflow flow), then close it.
      setShowAddQuestionModal(false);
      // Show the success modal.
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
      message.error('Failed to add question.');
    }
  };

  // Render drop-downs for each level.
  const renderDropDowns = () => {
    const dropDowns = [];
    for (let level = 1; level <= FIXED_LEVELS; level++) {
      const options = getOptionsForLevel(treeOptions, level, selectedValues);
      // If there are no options for a given level, stop rendering further drop-downs.
      if (!options || options.length === 0) break;
      dropDowns.push(
        <div key={level} style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: 8 }}>Level {level}:</span>
          <Select
            placeholder={`Select Level ${level}`}
            style={{ width: 250 }}
            value={selectedValues[level - 1] || undefined}
            onChange={(value) => handleSelectChange(level, value)}
            allowClear
          >
            {options.map((opt: any) => (
              <Option key={opt.key} value={opt.key}>
                {opt.label}
              </Option>
            ))}
          </Select>
          <Button style={{ marginLeft: 8 }} onClick={() => onAddSectionClick(level)}>
            Add Section
          </Button>
        </div>
      );
    }
    return dropDowns;
  };

  return (
    <Layout style={{ padding: 24, background: '#fff', minHeight: '90vh' }}>
      <Content>
        <h2>Aptitude Practice Admin Panel</h2>
        {/* Breadcrumb shows the selected section path */}
        <Breadcrumb style={{ marginBottom: 16 }}>
          {selectedValues.map((val, idx) => (
            <Breadcrumb.Item key={idx}>{val}</Breadcrumb.Item>
          ))}
        </Breadcrumb>
        {/* Split the page into two panels */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {/* Left Panel: Section selectors */}
          <div style={{ flex: 1 }}>
            <Spin spinning={loading}>{renderDropDowns()}</Spin>
          </div>
          {/* Right Panel: Either render inline question form or a prompt */}
          <div style={{ flex: 2, padding: '0 16px', borderLeft: '1px solid #f0f0f0' }}>
            {/* If user selected all 4 levels and is not in section workflow, show inline question form */}
            {selectedValues.length === FIXED_LEVELS && sectionWorkflowLevel === null ? (
              <div style={{ marginTop: 48 }}>
                <QuestionForm form={questionForm} onFinish={handleAddQuestion} />
              </div>
            ) : (
              <div style={{ marginTop: 48, textAlign: 'center', color: '#888' }}>
                <h3>Complete all 4 levels to add a question</h3>
              </div>
            )}
          </div>
        </div>
      </Content>

      {/* Modal for sequential section additions */}
      <Modal
        title={`Add New Section for Level ${sectionWorkflowLevel}`}
        open={sectionWorkflowLevel !== null}
        onCancel={() => setSectionWorkflowLevel(null)}
        footer={null}
        destroyOnClose
      >
        <Form form={sectionForm} layout="vertical" onFinish={handleSectionWorkflowSubmit}>
          <Form.Item
            label={`Section Name for Level ${sectionWorkflowLevel}`}
            name="sectionName"
            rules={[{ required: true, message: 'Please enter the section name' }]}
          >
            <Input placeholder="Enter section name" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {sectionWorkflowLevel === FIXED_LEVELS ? 'Finish and Add Question' : 'Next'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal for Adding a New Question (used in the section workflow flow) */}
      <Modal
        title="Add New Question"
        open={showAddQuestionModal}
        onCancel={() => setShowAddQuestionModal(false)}
        footer={null}
        destroyOnClose
      >
        <QuestionForm form={questionForm} onFinish={handleAddQuestion} />
      </Modal>

      {/* New Success Modal added after question submit */}
      <Modal
        title="Success"
        open={showSuccessModal}
        onOk={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>
            OK
          </Button>,
        ]}
      >
        <p>Node or slash question added successfully</p>
      </Modal>
    </Layout>
  );
};

export default SimpleAptitudeAdminPanel;



// import React, { useEffect, useState } from 'react';
// import {
//   Layout,
//   Breadcrumb,
//   Select,
//   Button,
//   Modal,
//   Form,
//   Input,
//   InputNumber,
//   message,
//   Spin,
// } from 'antd';
// import { db } from '../../firebaseConfig';
// import { ref as dbRef, onValue, push, set } from 'firebase/database';
// import CryptoJS from 'crypto-js';

// const { Content } = Layout;
// const { Option } = Select;
// const { TextArea } = Input;

// // Use your secret key
// const APTITUDE_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// // Encrypt sensitive fields
// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(APTITUDE_AES_SECRET_KEY);
//     const encrypted = CryptoJS.AES.encrypt(plainText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return encrypted.toString();
//   } catch (error) {
//     console.error('Encryption failed:', error);
//     return plainText;
//   }
// };

// // Recursively build a simple tree structure (options) from Firebase data.
// // We assume that if an object has a "question" property, it’s a leaf record.
// const buildTreeOptions = (obj: any): any[] => {
//   const options: any[] = [];
//   for (const key in obj) {
//     if (Object.prototype.hasOwnProperty.call(obj, key)) {
//       const val = obj[key];
//       if (typeof val === 'object' && val !== null && !('question' in val)) {
//         options.push({
//           key,
//           label: key,
//           children: buildTreeOptions(val),
//         });
//       }
//     }
//   }
//   return options;
// };

// // Given the tree (an array of nested nodes) and a selected path (array of keys),
// // return the options (children) for the given level.
// const getOptionsForLevel = (tree: any[], level: number, selectedPath: string[]) => {
//   if (level === 1) return tree;
//   let currentNodes = tree;
//   for (let i = 0; i < level - 1; i++) {
//     const sel = selectedPath[i];
//     const found = currentNodes.find((n: any) => n.key === sel);
//     if (!found || !found.children) return [];
//     currentNodes = found.children;
//   }
//   return currentNodes;
// };

// const FIXED_LEVELS = 4; // Maximum number of tree levels

// const SimpleAptitudeAdminPanel: React.FC = () => {
//   // Full tree data loaded from Firebase.
//   const [treeOptions, setTreeOptions] = useState<any[]>([]);
//   // selectedValues array stores the key selected at each level.
//   const [selectedValues, setSelectedValues] = useState<string[]>([]);
//   // loading flag
//   const [loading, setLoading] = useState<boolean>(true);

//   // States to control the modal workflow
//   // sectionWorkflowLevel === null means no section workflow is active.
//   const [sectionWorkflowLevel, setSectionWorkflowLevel] = useState<number | null>(null);
//   // Control the question modal
//   const [showAddQuestionModal, setShowAddQuestionModal] = useState<boolean>(false);

//   // Form instances
//   const [sectionForm] = Form.useForm();
//   const [questionForm] = Form.useForm();

//   // Load the entire tree from Firebase at Placement/Aptitude_Practice.
//   useEffect(() => {
//     const aptitudeRef = dbRef(db, 'version12/Placement/Aptitude_Practice');
//     const unsubscribe = onValue(aptitudeRef, (snapshot) => {
//       const data = snapshot.val();
//       if (data) {
//         setTreeOptions(buildTreeOptions(data));
//       } else {
//         setTreeOptions([]);
//       }
//       setLoading(false);
//     });
//     return () => unsubscribe();
//   }, []);

//   // Handler for when a drop-down value is changed.
//   const handleSelectChange = (level: number, value: string) => {
//     // Update the selectedValues up to this level.
//     // If level 2 is changed, then remove any selection for level 3 and beyond.
//     setSelectedValues((prev) => {
//       const newSelected = [...prev];
//       newSelected[level - 1] = value;
//       return newSelected.slice(0, level);
//     });
//   };

//   // Function to get the Firebase path for a given level.
//   // For a drop-down at level L, if a section is added, the parent path is the selections from levels 1 through L - 1.
//   const getFirebasePathForLevel = (level: number): string => {
//     if (level === 1) return 'version12/Placement/Aptitude_Practice';
//     const parentPath = selectedValues.slice(0, level - 1).join('/');
//     return `version12/Placement/Aptitude_Practice/${parentPath}`;
//   };

//   // Start the section workflow at a given level.
//   const onAddSectionClick = (level: number) => {
//     // Remove any later selections if user decides to add new sections starting from this level.
//     setSelectedValues((prev) => prev.slice(0, level - 1));
//     setSectionWorkflowLevel(level);
//     sectionForm.resetFields();
//   };

//   // Sequentially submit a new section at the current workflow level.
//   const handleSectionWorkflowSubmit = async (values: any) => {
//     const { sectionName } = values;
//     if (!sectionName?.trim()) {
//       message.error('Please enter a valid section name.');
//       return;
//     }
//     const newSection = sectionName.trim();
//     // The new section is added as a child of the node at level (current workflow level – 1).
//     const parentPath = getFirebasePathForLevel(sectionWorkflowLevel!);
//     const fullPath = `${parentPath}/${newSection}`;
//     try {
//       await set(dbRef(db, fullPath), {}); // Create an empty object in Firebase.
//       message.success(`Section '${newSection}' added at level ${sectionWorkflowLevel}!`);
//       // Update selectedValues at this level.
//       setSelectedValues((prev) => {
//         const newSel = [...prev];
//         newSel[sectionWorkflowLevel! - 1] = newSection;
//         return newSel.slice(0, sectionWorkflowLevel!);
//       });
//       sectionForm.resetFields();
//       // If not yet at the last level, advance to the next level.
//       if (sectionWorkflowLevel! < FIXED_LEVELS) {
//         setSectionWorkflowLevel(sectionWorkflowLevel! + 1);
//       } else {
//         // If we have reached level 4, complete the workflow.
//         setSectionWorkflowLevel(null);
//         // Open question modal after finishing section workflow.
//         setShowAddQuestionModal(true);
//       }
//     } catch (error) {
//       console.error(error);
//       message.error(`Failed to add section at level ${sectionWorkflowLevel}`);
//     }
//   };

//   // Handle Add Question button click.
//   // (This button is still available when the selected node has no children.)
//   const onAddQuestionClick = () => {
//     questionForm.resetFields();
//     setShowAddQuestionModal(true);
//   };

//   // Submit new question.
//   const handleAddQuestion = async (values: any) => {
//     const { question, options, aptCategory, correct_answer, explanation, time_limit } = values;
//     if (!question || !options || !aptCategory || !correct_answer || !explanation || !time_limit) {
//       message.error('Please fill in all required fields.');
//       return;
//     }
//     const now = new Date().toLocaleDateString();
//     // The question is added under the currently selected node (i.e. the full branch).
//     const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}`;
//     const questionRef = push(dbRef(db, path));
//     const questionId = questionRef.key;
//     const data = {
//       id: questionId,
//       question: encryptAES(question),
//       correct_answer: encryptAES(correct_answer),
//       explanation: encryptAES(explanation),
//       options: options.split(',').map((o: string) => o.trim()),
//       category: aptCategory,
//       time_limit,
//       date: now,
//     };
//     try {
//       await set(questionRef, data);
//       message.success('Question added successfully!');
//       setShowAddQuestionModal(false);
//     } catch (error) {
//       console.error(error);
//       message.error('Failed to add question.');
//     }
//   };

//   // Render drop-downs for each level.
//   // We'll render up to 4 levels (or until no options are available).
//   const renderDropDowns = () => {
//     const dropDowns = [];
//     for (let level = 1; level <= FIXED_LEVELS; level++) {
//       const options = getOptionsForLevel(treeOptions, level, selectedValues);
//       // If there are no options for this level but a parent has been selected, do not render further.
//       if (!options || options.length === 0) break;
//       dropDowns.push(
//         <div key={level} style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
//           <span style={{ marginRight: 8 }}>Level {level}:</span>
//           <Select
//             placeholder={`Select Level ${level}`}
//             style={{ width: 250 }}
//             value={selectedValues[level - 1] || undefined}
//             onChange={(value) => handleSelectChange(level, value)}
//             allowClear
//           >
//             {options.map((opt: any) => (
//               <Option key={opt.key} value={opt.key}>
//                 {opt.label}
//               </Option>
//             ))}
//           </Select>
//           <Button style={{ marginLeft: 8 }} onClick={() => onAddSectionClick(level)}>
//             Add Section
//           </Button>
//         </div>
//       );
//     }
//     return dropDowns;
//   };

//   return (
//     <Layout style={{ padding: 24, background: '#fff', minHeight: '90vh' }}>
//       <Content>
//         <h2>Aptitude Practice Admin Panel</h2>
//         {/* Breadcrumb for current selection */}
//         <Breadcrumb style={{ marginBottom: 16 }}>
//           {selectedValues.map((val, idx) => (
//             <Breadcrumb.Item key={idx}>{val}</Breadcrumb.Item>
//           ))}
//         </Breadcrumb>
//         {/* Render the drop-downs for each level */}
//         <Spin spinning={loading}>
//           {renderDropDowns()}
//           {/* If a node is selected at the deepest level (or no further children exist), show Add Question button */}
//           {selectedValues.length > 0 &&
//             getOptionsForLevel(treeOptions, selectedValues.length + 1, selectedValues).length === 0 && (
//               <Button type="primary" onClick={onAddQuestionClick}>
//                 Add Question Here
//               </Button>
//             )}
//         </Spin>
//       </Content>

//       {/* Sequential Modal for Adding Sections from the clicked level up to level 4 */}
//       <Modal
//         title={`Add New Section for Level ${sectionWorkflowLevel}`}
//         open={sectionWorkflowLevel !== null}
//         onCancel={() => setSectionWorkflowLevel(null)}
//         footer={null}
//         destroyOnClose
//       >
//         <Form form={sectionForm} layout="vertical" onFinish={handleSectionWorkflowSubmit}>
//           <Form.Item
//             label={`Section Name for Level ${sectionWorkflowLevel}`}
//             name="sectionName"
//             rules={[{ required: true, message: 'Please enter the section name' }]}
//           >
//             <Input placeholder="Enter section name" />
//           </Form.Item>
//           <Form.Item>
//             <Button type="primary" htmlType="submit">
//               {sectionWorkflowLevel === FIXED_LEVELS ? 'Proceed to Add Question' : 'Next'}
//             </Button>
//           </Form.Item>
//         </Form>
//       </Modal>

//       {/* Modal for Adding a New Question */}
//       <Modal
//         title="Add New Question"
//         open={showAddQuestionModal}
//         onCancel={() => setShowAddQuestionModal(false)}
//         footer={null}
//         destroyOnClose
//       >
//         <Form
//           form={questionForm}
//           layout="vertical"
//           onFinish={handleAddQuestion}
//           initialValues={{ time_limit: 60, aptCategory: 'Quantitative' }}
//         >
//           <Form.Item
//             label="Question"
//             name="question"
//             rules={[{ required: true, message: 'Please enter the question' }]}
//           >
//             <TextArea rows={3} placeholder="Enter the question" />
//           </Form.Item>
//           <Form.Item
//             label="Options (comma separated)"
//             name="options"
//             rules={[{ required: true, message: 'Please enter options separated by commas' }]}
//           >
//             <TextArea rows={2} placeholder="e.g. 12, 15, 27, 30" />
//           </Form.Item>
//           <Form.Item
//             label="Category (e.g. Quantitative)"
//             name="aptCategory"
//             rules={[{ required: true, message: 'Please enter the aptitude category' }]}
//           >
//             <Input placeholder="Enter aptitude category" />
//           </Form.Item>
//           <Form.Item
//             label="Correct Answer"
//             name="correct_answer"
//             rules={[{ required: true, message: 'Please enter the correct answer' }]}
//           >
//             <Input placeholder="Enter the correct answer" />
//           </Form.Item>
//           <Form.Item
//             label="Explanation"
//             name="explanation"
//             rules={[{ required: true, message: 'Please enter the explanation' }]}
//           >
//             <TextArea rows={3} placeholder="Enter explanation" />
//           </Form.Item>
//           <Form.Item
//             label="Time Limit (seconds)"
//             name="time_limit"
//             rules={[{ required: true, message: 'Please enter the time limit' }]}
//           >
//             <InputNumber min={1} style={{ width: '100%' }} />
//           </Form.Item>
//           <Button type="primary" htmlType="submit">
//             Add Question
//           </Button>
//         </Form>
//       </Modal>
//     </Layout>
//   );
// };

// export default SimpleAptitudeAdminPanel;
