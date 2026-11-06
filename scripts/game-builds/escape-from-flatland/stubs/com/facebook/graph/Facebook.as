// OFFLINE STUB (pdyxs.wtf rebuild): the real Facebook Graph API SWC and its backend are gone.
// Every call reports failure, as if the player declined to sign in.
package com.facebook.graph
{
	public class Facebook
	{
		public static function init(appId:String, callback:Function = null, accessToken:String = null):void {}
		public static function login(callback:Function, options:Object = null):void
		{
			if (callback != null) callback(null, {error: "offline"});
		}
		public static function api(method:String, callback:Function = null, params:* = null, requestMethod:String = "GET"):void
		{
			if (callback != null) callback(null, {error: "offline"});
		}
	}
}
