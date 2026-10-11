
import React, { useRef, useState } from 'react';
import { RichText } from './RichText';
import { stripMarkup } from '../services/markup';
import { TestData } from '../types';
import { Printer, ArrowLeft, Download, Loader2 } from 'lucide-react';

interface PrintLayoutProps {
  data: TestData;
  onBack: () => void;
}

declare var html2pdf: any;

export const PrintLayout: React.FC<PrintLayoutProps> = ({ data, onBack }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSystemPrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    setIsGenerating(true);

    const element = contentRef.current;
    
    // html2pdf options
    const opt = {
      margin: 0, 
      filename: `Mini_SR_Test_Level_${data.srLevel}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollY: 0,
        // Increase window height significantly to prevent bottom clipping
        windowHeight: element.scrollHeight + 200 
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] } 
    };

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error("PDF generation failed", e);
      alert("PDF 생성 중 오류가 발생했습니다. '인쇄 (System)' 버튼을 사용해주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to calculate question numbers based on sections
  const vocabStart = 1;
  const grammarStart = vocabStart + data.vocabulary.length;
  const readingStart = grammarStart + data.grammar.length;
  // Listening starts after Reading
  const totalReadingQs = data.reading.reduce((acc, curr) => acc + curr.questions.length, 0);
  const listeningStart = readingStart + totalReadingQs;

  let currentReadingQIndex = readingStart;
  // 이전 버전 데이터에만 Part 2(grammar)가 있으므로 파트 번호를 동적으로 매긴다.
  const readingPart = data.grammar.length > 0 ? 3 : 2;
  const listeningPart = readingPart + 1;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Control Bar - Hidden when printing */}
      <div className="print:hidden sticky top-0 bg-white border-b shadow-md p-4 flex flex-col md:flex-row justify-between items-center z-50 no-print gap-4">
        <button 
          onClick={onBack}
          className="flex items-center text-black hover:underline font-bold self-start md:self-center"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          돌아가기
        </button>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <span className="text-xs text-gray-500 hidden lg:inline font-medium">
            *배경 그래픽 인쇄 옵션을 켜주세요 (System 인쇄 시)
          </span>
          
          <button 
            onClick={handleSystemPrint}
            className="w-full sm:w-auto bg-white border-2 border-black hover:bg-gray-100 text-black px-4 py-2 rounded-lg font-bold flex items-center justify-center transition-all"
          >
            <Printer className="w-5 h-5 mr-2" />
            인쇄 (System)
          </button>

          <button 
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Download className="w-5 h-5 mr-2" />
            )}
            PDF 다운로드
          </button>
        </div>
      </div>

      {/* 
        A4 Paper Container 
        Standard A4 is 210mm x 297mm.
        We adjust width to 200mm to ensure no cut-off in PDF generation.
      */}
      <div className="flex justify-center my-8 print:my-0">
        <div 
          ref={contentRef}
          id="print-content"
          className="print-layout bg-white shadow-2xl print:shadow-none text-black box-border relative"
          style={{
            width: '200mm', // Reduced width to prevent right-side clipping
            minHeight: '297mm',
            padding: '12mm', // Slightly reduced padding
            margin: '0 auto',
            backgroundColor: 'white' // Explicit background
          }}
        >
          
          {/* Header */}
          <header className="border-b-4 border-black pb-4 mb-8 flex justify-between items-end avoid-break">
            <div>
              <h1 className="text-4xl font-serif font-bold text-black tracking-tight">Mini SR Test</h1>
              <div className="mt-3 flex items-center space-x-4">
                <span className="bg-black text-white px-4 py-1 text-lg font-bold uppercase">Level {data.srLevel}</span>
                <span className="text-black text-base uppercase tracking-widest font-bold">Comprehensive Test</span>
              </div>
            </div>
            <div className="text-right text-black text-base space-y-2">
              <div><span className="font-bold uppercase mr-2">Student Name:</span> __________________________</div>
              <div><span className="font-bold uppercase mr-2">Date:</span> ___________________________</div>
            </div>
          </header>

          {/* Part 1: Word Knowledge */}
          <section className="mb-10">
            <div className="flex items-center mb-6 border-b-2 border-gray-200 pb-2 avoid-break">
              <span className="text-xl font-bold uppercase tracking-wider text-black mr-4">Part 1</span>
              <h2 className="text-xl font-bold text-black italic">Word Knowledge and Skills</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-y-8">
              {data.vocabulary.map((q, i) => (
                <div key={q.id} className="avoid-break mb-2">
                  <div className="mb-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{q.domain}</span>
                    <div className="flex items-start">
                      <span className="font-bold mr-3 text-black text-xl">{vocabStart + i}.</span>
                      <div>
                        {q.question.includes('___') && (
                          <p className="text-sm text-gray-600 mb-1">Choose the word that best completes the sentence.</p>
                        )}
                        <p className="text-black font-medium text-xl leading-snug"><RichText text={q.question} /></p>
                      </div>
                    </div>
                  </div>
                  <div className="ml-9 space-y-1.5">
                    {q.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center py-0.5">
                         <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center mr-3 flex-shrink-0">
                         </div>
                         <span className="text-black text-lg leading-tight">{stripMarkup(opt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Part 2: Grammar (이전 버전 시험 데이터에만 존재) */}
          {data.grammar.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center mb-6 border-b-2 border-gray-200 pb-2 avoid-break">
              <span className="text-xl font-bold uppercase tracking-wider text-black mr-4">Part 2</span>
              <h2 className="text-xl font-bold text-black italic">Understanding Author's Craft</h2>
            </div>
            
            <div className="space-y-8">
              {data.grammar.map((q, i) => (
                <div key={q.id} className="avoid-break mb-2">
                  <div className="mb-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{q.domain}</span>
                    <div className="flex items-start">
                      <span className="font-bold mr-3 text-black text-xl">{grammarStart + i}.</span>
                      <p className="text-black font-medium text-xl leading-snug"><RichText text={q.question} /></p>
                    </div>
                  </div>
                  <div className="ml-9 space-y-1.5">
                    {q.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center py-0.5">
                         <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center mr-3 flex-shrink-0"></div>
                         <span className="text-black text-lg leading-tight">{stripMarkup(opt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Explicit Page Break before Reading Section */}
          <div className="page-break"></div>

          {/* Part 3: Reading Comprehension */}
          <section className="mt-8">
            <div className="flex items-center mb-6 border-b-2 border-gray-200 pb-2 avoid-break">
              <span className="text-xl font-bold uppercase tracking-wider text-black mr-4">Part {readingPart}</span>
              <h2 className="text-xl font-bold text-black italic">Reading Comprehension</h2>
            </div>
            
            {data.reading.map((section, sectionIdx) => (
              <div 
                key={sectionIdx} 
                className={`mb-10 ${section.questions.length > 1 && sectionIdx > 0 ? 'new-page-section' : 'avoid-break'}`}
              >
                {/* Passage - Increased size significantly for readability */}
                <div className="p-6 border border-black mb-6 bg-white avoid-break">
                  {section.passageTitle && (
                    <h3 className="text-2xl font-bold font-serif text-center mb-4 text-black">{section.passageTitle}</h3>
                  )}
                  <div className="prose prose-xl prose-p:my-3 font-serif text-black leading-loose text-justify max-w-none break-words">
                    {section.passageContent.split('\n').map((p, idx) => (
                      <p key={idx} className="indent-8 text-xl"><RichText text={p} /></p>
                    ))}
                  </div>
                </div>

                {/* Questions for this passage */}
                <div className="space-y-8 pl-2">
                  {section.questions.map((q, i) => {
                    const qNum = currentReadingQIndex++;
                    return (
                      <div key={q.id} className="avoid-break mb-2">
                        <div className="mb-3">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{q.domain}</span>
                          <div className="flex items-start">
                             <span className="font-bold mr-3 text-black text-lg">{qNum}.</span>
                             <p className="text-black font-medium text-lg leading-snug"><RichText text={q.question} /></p>
                          </div>
                        </div>
                        <div className="ml-8 space-y-1.5">
                          {q.options.map((opt, idx) => (
                            <div key={idx} className="flex items-center py-0.5">
                               <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center mr-3 flex-shrink-0"></div>
                               <span className="text-black text-lg leading-tight">{stripMarkup(opt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* Part 4: Listening Comprehension (Optional) */}
          {data.listening && data.listening.length > 0 && (
            <section className="mb-10 new-page-section">
               <div className="flex items-center mb-6 border-b-2 border-gray-200 pb-2 avoid-break">
                <span className="text-xl font-bold uppercase tracking-wider text-black mr-4">Part {listeningPart}</span>
                <h2 className="text-xl font-bold text-black italic">Listening Comprehension</h2>
              </div>
              <p className="mb-4 text-sm text-gray-500 italic">* Parent/Teacher: Please read the scripts provided in the Answer Key section to the student.</p>

              <div className="space-y-8">
                {data.listening.map((q, i) => (
                  <div key={q.id} className="avoid-break mb-2">
                    <div className="mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{q.domain}</span>
                      <div className="flex items-start">
                        <span className="font-bold mr-3 text-black text-xl">{listeningStart + i}.</span>
                        {/* We only show the question text, the script is hidden for the student */}
                        <p className="text-black font-medium text-xl leading-snug"><RichText text={q.question} /></p>
                      </div>
                    </div>
                    <div className="ml-9 space-y-1.5">
                      {q.options.map((opt, idx) => (
                        <div key={idx} className="flex items-center py-0.5">
                           <div className="w-4 h-4 rounded-full border border-black flex items-center justify-center mr-3 flex-shrink-0"></div>
                           <span className="text-black text-lg leading-tight">{stripMarkup(opt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Answer Key always on a new page - Applied to the SECTION wrapper for robust breaking */}
          <section className="new-page-section bg-white pt-8">
            <h2 className="text-3xl font-bold text-black mb-8 border-b-4 border-black pb-2 uppercase tracking-tight avoid-break">
              Answer Key & Explanations
            </h2>

            <div className="space-y-8 text-black">
               {/* Vocab Key */}
               <div className="avoid-break">
                  <h3 className="font-bold text-xl text-black uppercase tracking-wider mb-4">Part 1: Word Knowledge and Skills</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {data.vocabulary.map((q, i) => (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-baseline text-base border-b border-gray-200 pb-3">
                        <div className="flex items-baseline mb-1 sm:mb-0">
                          <span className="font-bold w-10 text-lg">{vocabStart + i}.</span>
                          <span className="font-bold text-black w-10 text-lg">({String.fromCharCode(65 + q.correctAnswer)})</span>
                        </div>
                        <div className="flex-1 text-gray-800 leading-relaxed text-lg"><RichText text={q.explanation} /></div>
                      </div>
                    ))}
                  </div>
               </div>

               {/* Grammar Key */}
               {data.grammar.length > 0 && (
               <div className="avoid-break">
                  <h3 className="font-bold text-xl text-black uppercase tracking-wider mb-4 mt-6">Part 2: Author's Craft</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {data.grammar.map((q, i) => (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-baseline text-base border-b border-gray-200 pb-3">
                        <div className="flex items-baseline mb-1 sm:mb-0">
                          <span className="font-bold w-10 text-lg">{grammarStart + i}.</span>
                          <span className="font-bold text-black w-10 text-lg">({String.fromCharCode(65 + q.correctAnswer)})</span>
                        </div>
                        <div className="flex-1 text-gray-800 leading-relaxed text-lg"><RichText text={q.explanation} /></div>
                      </div>
                    ))}
                  </div>
               </div>
               )}

               {/* Reading Key */}
               <div className="avoid-break">
                  <h3 className="font-bold text-xl text-black uppercase tracking-wider mb-4 mt-6">Part {readingPart}: Reading</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {data.reading.flatMap((s) => s.questions).map((q, i) => (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-baseline text-base border-b border-gray-200 pb-3">
                        <div className="flex items-baseline mb-1 sm:mb-0">
                          <span className="font-bold w-10 text-lg">{readingStart + i}.</span>
                          <span className="font-bold text-black w-10 text-lg">({String.fromCharCode(65 + q.correctAnswer)})</span>
                        </div>
                        <div className="flex-1 text-gray-800 leading-relaxed text-lg"><RichText text={q.explanation} /></div>
                      </div>
                    ))}
                  </div>
               </div>

               {/* Listening Key & Scripts */}
               {data.listening && data.listening.length > 0 && (
                <div className="avoid-break">
                    <h3 className="font-bold text-xl text-black uppercase tracking-wider mb-4 mt-6">Part {listeningPart}: Listening (Teacher's Script)</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {data.listening.map((q, i) => (
                        <div key={q.id} className="flex flex-col text-base border-b border-gray-200 pb-3">
                           {/* Script for Teacher */}
                           <div className="mb-2 p-3 bg-gray-100 border-l-4 border-black rounded-r">
                             <span className="block font-bold text-xs uppercase text-gray-500 mb-1">Read to Student:</span>
                             <p className="italic text-lg text-black">"{q.script}"</p>
                           </div>

                          <div className="flex flex-col sm:flex-row sm:items-baseline">
                            <div className="flex items-baseline mb-1 sm:mb-0">
                              <span className="font-bold w-10 text-lg">{listeningStart + i}.</span>
                              <span className="font-bold text-black w-10 text-lg">({String.fromCharCode(65 + q.correctAnswer)})</span>
                            </div>
                            <div className="flex-1 text-gray-800 leading-relaxed text-lg"><RichText text={q.explanation} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
               )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
