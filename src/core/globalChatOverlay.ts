import { mountChatOverlay } from './chatOverlay';
import { getChatHistory, getMyNickname, sendGlobalChat, subscribeChat } from '../meta/globalChat';

// 덱 선택 화면과 개인전 화면에서 같이 쓰는 공용 채팅창. 화면을 옮겨 다녀도 대화가
// 이어지도록, 화면에 들어올 때 지금까지의 대화를 다시 채워 넣는다. 화면을 나갈 때는
// 반드시 반환된 destroy()를 불러야 한다(안 부르면 채팅 버튼이 남는다).
export function mountGlobalChat(): { destroy: () => void } {
  const chat = mountChatOverlay((message) => sendGlobalChat(message));

  getChatHistory().forEach((msg) => {
    chat.addMessage(msg.nickname, msg.message, msg.nickname === getMyNickname(), true);
  });

  const unsubscribe = subscribeChat((msg) => {
    chat.addMessage(msg.nickname, msg.message, msg.nickname === getMyNickname());
  });

  return {
    destroy: () => {
      unsubscribe();
      chat.destroy();
    },
  };
}
