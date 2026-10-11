
import React, { useRef, useState, useMemo } from 'react';
import { RichText } from './RichText';
import { TestData } from '../types';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';

interface VocabWorksheetProps {
  data: TestData;
  onBack: () => void;
}

declare var html2pdf: any;

export const VocabWorksheet: React.FC<VocabWorksheetProps> = ({ data, onBack }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Pagination Configuration for A4 Portrait
  // Page 1: Header + 3 words
  // Page 2+: 3 words
  // Keeping 3 items per page to ensure large font legibility and handwriting space
  const ITEMS_ON_FIRST_PAGE = 3;
  const ITEMS_PER_PAGE = 3;

  // Chunk the vocabulary list into explicit pages
  const pages = useMemo(() => {
    const chunks: any[][] = [];
    const vocab = data.keyVocabulary;
    
    // Page 1
    chunks.push(vocab.slice(0, ITEMS_ON_FIRST_PAGE));
    
    // Subsequent Pages
    let currentIdx = ITEMS_ON_FIRST_PAGE;
    while (currentIdx < vocab.length) {
      chunks.push(vocab.slice(currentIdx, currentIdx + ITEMS_PER_PAGE));
      currentIdx += ITEMS_PER_PAGE;
    }
    
    return chunks;
  }, [data.keyVocabulary]);

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    setIsGenerating(true);
    const element = contentRef.current;
    
    const opt = {
      margin: 10, // 10mm margins
      filename: `Vocabulary_Writing_Practice_Level_${data.srLevel}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollY: 0,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error("PDF generation failed", e);
      alert("PDF 생성 중 오류가 발생했습니다. '인쇄' 버튼을 사용해 PDF로 저장해 주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white pb-20 no-print-layout">
      {/* Control Bar */}
      <div className="print:hidden sticky top-0 bg-white border-b shadow-md p-4 flex justify-between items-center z-50 no-print">
        <button onClick={onBack} className="flex items-center text-black font-bold hover:underline">
          <ArrowLeft className="w-5 h-5 mr-2" />
          돌아가기
        </button>
        <div className="flex gap-4">
          <button 
            onClick={() => window.print()} 
            className="bg-white border-2 border-black text-black px-4 py-2 rounded-lg font-bold flex items-center hover:bg-gray-50 transition-all"
          >
            <Printer className="w-5 h-5 mr-2" /> 인쇄
          </button>
          <button 
            onClick={handleDownloadPdf} 
            disabled={isGenerating} 
            className="bg-black text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />}
            PDF 다운로드 (쓰기용)
          </button>
        </div>
      </div>

      {/* Content Container */}
      <div className="flex flex-col items-center mt-8 print:mt-0 gap-8 print:gap-0 w-full overflow-x-auto">
        <div ref={contentRef}>
          {pages.map((pageWords, pageIndex) => (
            <div 
              key={pageIndex}
              className="print-layout bg-white shadow-2xl print:shadow-none box-border text-black font-serif relative flex flex-col mx-auto"
              style={{
                // Fixed width 190mm to center within 210mm A4 page with margins
                width: '190mm', 
                // REDUCED minHeight to prevent ghost blank pages.
                // A4 (297mm) - Margins (20mm) = 277mm printable.
                // Setting to 255mm provides a safety buffer so html2pdf doesn't think it needs a new page.
                minHeight: '255mm', 
                padding: '10mm', 
                pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto',
                marginBottom: '0',
                backgroundColor: 'white',
                overflow: 'hidden' 
              }}
            >
              {/* Header - Only on Page 1 */}
              {pageIndex === 0 ? (
                <header className="mb-6">
                  <div className="flex justify-between items-end border-b-4 border-black pb-4">
                    <div>
                      <h1 className="text-[32px] font-bold tracking-tight text-black leading-none mb-2">Vocabulary Practice</h1>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-black text-white text-xs font-bold uppercase rounded">SR Level {data.srLevel}</span>
                        <span className="text-[12px] font-bold uppercase text-gray-500 tracking-wider">Key Words Writing</span>
                      </div>
                    </div>
                    <div className="text-right text-[12px] font-sans text-gray-700 space-y-2 pb-1">
                      <p><span className="font-bold">Name:</span> ______________________</p>
                      <p><span className="font-bold">Date:</span> ______________________</p>
                    </div>
                  </div>
                </header>
              ) : (
                // Header for subsequent pages
                <div className="h-[20mm] w-full border-b-2 border-gray-100 mb-6 flex justify-between items-end pb-2">
                   <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-bold uppercase rounded">SR Level {data.srLevel}</span>
                   </div>
                   <span className="text-[10px] text-gray-400 font-sans font-bold">PAGE {pageIndex + 1}</span>
                </div>
              )}

              {/* Page Content - Vertical List */}
              {/* Reduced gap from gap-8 to gap-5 to ensure 3 items fit comfortably within the reduced minHeight */}
              <div className="flex-grow flex flex-col justify-start gap-5">
                {pageWords.map((v, i) => {
                  const absoluteIndex = pageIndex === 0 
                    ? i 
                    : ITEMS_ON_FIRST_PAGE + (pageIndex - 1) * ITEMS_PER_PAGE + i;

                  return (
                    <div key={absoluteIndex} className="group w-full">
                      {/* Word Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex flex-col max-w-[75%]">
                          <div className="flex items-baseline">
                            <span className="text-[20px] font-bold mr-3 text-gray-400 w-6 text-right select-none">{absoluteIndex + 1}.</span>
                            <span className="text-[36px] font-bold tracking-tight text-black leading-none">{v.word}</span>
                          </div>
                          {/* English Definition */}
                          <span className="text-[12px] text-gray-600 font-sans ml-11 mt-1 leading-snug">
                            <RichText text={v.definition} />
                          </span>
                        </div>
                        {/* Korean Meaning */}
                        <div className="flex items-center pt-2 max-w-[25%] justify-end text-right">
                          <span className="text-[18px] font-bold text-gray-900 leading-tight break-keep">
                            {v.meaning}
                          </span>
                        </div>
                      </div>
                      
                      {/* Writing Practice Area */}
                      <div className="space-y-3 pl-2">
                        {/* Tracing Row */}
                        <div className="flex items-end border-b border-gray-300 pb-1 h-12">
                          <div className="w-16 flex-shrink-0 text-left pb-1">
                             <span className="text-[10px] font-sans font-bold text-gray-400 uppercase tracking-widest select-none">Trace</span>
                          </div>
                          <div className="flex-grow flex items-end">
                            <span 
                              className="text-[36px] text-gray-100 tracking-widest font-bold select-none leading-none mb-[-2px]"
                              style={{ 
                                WebkitTextStroke: '1px #d1d5db',
                                fontFamily: 'serif' 
                              }}
                            >
                              {v.word}
                            </span>
                          </div>
                        </div>
                        
                        {/* Writing Row 1 */}
                        <div className="flex items-end border-b-2 border-black pb-1 h-12">
                          <div className="w-16 flex-shrink-0 text-left pb-1">
                             <span className="text-[10px] font-sans font-bold text-gray-400 uppercase tracking-widest select-none">Write</span>
                          </div>
                          <div className="flex-grow"></div>
                        </div>
                        
                        {/* Writing Row 2 */}
                        <div className="flex items-end border-b-2 border-black pb-1 h-12">
                          <div className="w-16 flex-shrink-0 text-left pb-1">
                             <span className="text-[10px] font-sans font-bold text-gray-400 uppercase tracking-widest select-none">Write</span>
                          </div>
                          <div className="flex-grow"></div>
                        </div>
                      </div>

                      {/* Example Sentence */}
                      <div className="mt-3 ml-16 p-3 bg-gray-50 border-l-4 border-gray-400 rounded-r-sm">
                        <div className="flex gap-2 items-start">
                          <span className="font-bold text-[10px] text-black uppercase flex-shrink-0 mt-0.5 bg-gray-200 px-1 rounded">Ex</span>
                          <p className="text-[13px] text-gray-800 italic leading-relaxed">"<RichText text={v.example} />"</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer on Every Page */}
              <footer className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center text-[9px] text-gray-400 font-sans tracking-widest uppercase">
                <span>Mini SR Test - Vocabulary Worksheet</span>
                <span>Page {pageIndex + 1}</span>
              </footer>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
