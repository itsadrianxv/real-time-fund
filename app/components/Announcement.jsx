'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ANNOUNCEMENT_KEY = 'hasClosedAnnouncement_v12';

export default function Announcement() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasClosed = localStorage.getItem(ANNOUNCEMENT_KEY);
    if (!hasClosed) {
      setIsVisible(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(ANNOUNCEMENT_KEY, 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="announcement-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <motion.div
            className="announcement-shell"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            <h2 className="announcement-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <span>版本说明</span>
            </h2>

            <div className="announcement-body">
              <p>v0.2.1 继续围绕实际记账和盯盘场景打磨体验，当前重点如下：</p>
              <p>1. 改进拍照识别基金的准确度。</p>
              <p>2. 扫描导入支持选择分组，并补充持仓金额与收益信息。</p>
              <p>3. 个性化设置新增完整基金名称展示。</p>
              <p>4. 列表补充估算收益、估值涨幅与持有收益涨幅。</p>
              <p>下一步计划继续完善大盘走势与关联板块能力。</p>
            </div>

            <div className="announcement-actions">
              <button className="button" onClick={handleClose}>
                我知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}