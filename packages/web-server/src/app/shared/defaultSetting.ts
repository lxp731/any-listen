import defaultSetting from '@any-listen/common/defaultSetting'
// import path from 'node:path'

defaultSetting['common.windowSizeId'] = 2
// 默认下载到共享音乐目录（可通过 allowPublicDir 放行更多目录）
defaultSetting['download.savePath'] = '/music'

export default defaultSetting
