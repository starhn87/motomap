import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
const jsx = (type: any, props: any) => ({ type, props });
const exported = (value: any) => ({ __esModule: true, default: value });
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node,...nodes(node.props.children)] : [];
test('선택한 제보 유형은 아이콘과 글자 모두 선택 배경과 대비된다', () => {
  for (const scheme of ['light', 'dark']) {
    const colors = { background: scheme === 'dark' ? '#0A0A0A' : '#FFFFFF', tint: scheme === 'dark' ? '#FAFAFA' : '#18181B', text: '#888888' };
    const state: any[] = []; let cursor=0;
    const module = loadModule<any>('components/submit/SubmitFeedback.tsx', {
      react: { useState: (value: any) => {const i=cursor++;if (!(i in state))state[i]=value;return [state[i],(v:any)=>state[i]=v];} },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View:'View', Text:'Text',TextInput:'Input',Pressable:'Button',ScrollView:'Scroll',KeyboardAvoidingView:'Avoid',Platform:{OS:'ios'},StyleSheet:{create:(s:any)=>s} },
      '@expo/vector-icons/Ionicons': exported('Icon'),
      'react-native-reanimated': { ...exported({createAnimatedComponent:(value:any)=>value}),useSharedValue:()=>({value:1}),useAnimatedStyle:()=>({}),withSpring:(v:any)=>v },
      '@/constants/Colors': exported({ [scheme]: colors }), '@/components/useColorScheme': {useColorScheme:()=>scheme},
      '@/lib/api/feedback': {}, '@/lib/toast': {}, '@/lib/push': {},
      '@/components/navigation/tabOcclusion': {TabScrollSpacer:'Spacer'},
      '@/components/navigation/headerInset': {useContentHeaderInset:()=>100},
      '@/components/navigation/headerScroll': {useTrackHeaderScroll:()=>()=>{}},
    });
    const render=()=>{cursor=0;return module.default();};
    let tree=render();
    for (const index of [0,1,2]) {
      nodes(tree).filter(n=>n.props.accessibilityRole==='radio')[index].props.onPress();tree=render();
      const selected=nodes(tree).find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityState.selected);
      const background=selected.props.style[1].backgroundColor;
      const icon=nodes(selected).find(n=>n.type==='Icon');
      assert.equal(icon.props.color,colors.background);assert.notEqual(icon.props.color,background);
    }
  }
});
