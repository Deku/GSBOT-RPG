/*
 *  The MIT License (MIT)
 *
 *  Copyright (c) 2014 Ulysse Manceron
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
 *
 */
// ID: abioncnjcacdmnichbdcjbanljjgjpgc
var songleft;
var allSongsId = [];
var lastPlayedSongs = [];
var actionTable = {};
var lastPlay;
var forcePlay = false;
var playingRandom = false;
var followingList = [];
var adminActions = {};
var alreadySaluted = {};

// GroovesharkUtils
var GU = {

    /* 
     * Broadcast functions
     */
    'broadcast': function() {
        if (GS.getLoggedInUserID() <= 0)
            alert('Cannot login!');
        else {
            GU.updateFollowing();
            GS.Services.API.getUserLastBroadcast().then(function(bc) {
                GS.Services.SWF.ready.then(function() {
                    GS.Services.SWF.resumeBroadcast(bc.BroadcastID);
                    setTimeout(GU.startBroadcasting, 3000, bc);
                });
            });
        }
    },
    'callback': function() {
        if (songleft != GU.songInQueue()) {
            songleft = GU.songInQueue();
            if (songleft >= 2)
                playingRandom = false;
            GU.renameBroadcast();
        }
        GU.addSongToHistory();
        if (songleft < 1)
            GU.playRandomSong();
        GU.deletePlayedSong();
        GU.forcePlay();
        /*
            Idea for later:
            To remove this callback, we can extends GS.Services.SWF.queueChange.
        */
    },
    'inBroadcast': function() {
        return $('#bc-take-over-btn').hasClass('hide');
    },
    'openSidePanel': function() {
        if ($('.icon-sidebar-open-m-gray')[0])
            $('.icon-sidebar-open-m-gray').click()
    },
    'renameBroadcast': function(bdcName) {
        var attributes = GS.getCurrentBroadcast().attributes;
        if (attributes == undefined)
            return;
        var maxDescriptionLength = 145;

        var defName = attributes.Description;
        defName = defName.substr(0, defName.indexOf(GUParams.prefixRename)) + GUParams.prefixRename + ' [EGSA] Grace Bot ';
        if (playingRandom) {
            defName += 'Playing from collection';
        } else {
            defName += GU.songInQueue() + ' song' + (GU.songInQueue() != 1 ? 's' : '') + ' left';
        }
        if (bdcName == null)
            bdcName = defName;
        GS.Services.SWF.changeBroadcastInfo(GS.getCurrentBroadcastID(), {
            'Description': bdcName.substr(0, maxDescriptionLength)
        });
    },
    'startBroadcasting': function(bc) {
        var properties = {
            'Description': bc.Description,
            'Name': bc.Name,
            'Tag': bc.Tag
        };
        if (GS.getCurrentBroadcast() === false) {
            GS.Services.SWF.startBroadcast(properties);
            setTimeout(GU.startBroadcasting, 3000, bc);
            return;
        }
        GU.renameBroadcast();
        setTimeout(function() {
            GU.sendMsg(GUParams.welcomeMessage);
        }, 1000);
        Grooveshark.setVolume(0); //mute the broadcast.
        // Remove all the messages in chat
        GU.removeMsg();
        GU.openSidePanel();
        GS.Services.API.userGetSongIDsInLibrary().then(function(result) {
            allSongsId = result.SongIDs;
        });
        if ($('#lightbox-close').length == 1) {
            $('#lightbox-close').click();
        }
        lastPlay = new Date();
        // Check if there are msg in the chat, and process them.
        setInterval(GU.callback, 1000);

        // Overload handlechat
        var handleBroadcastSaved = GS.Services.SWF.handleBroadcastChat;
        GS.Services.SWF.handleBroadcastChat = function(e, t) {
            handleBroadcastSaved(e, t);
            GU.doParseMessage(t);
        };

        // Overload handlejoin
        var handleBroadcastJoin = GS.Services.SWF.handleBroadcastListenerJoined;
        GS.Services.SWF.handleBroadcastListenerJoined = function(e, t) {
            handleBroadcastJoin(e, t);
            GU.doSalute(t);
        };
    },    



    /* 
     * Permissions functions
     */
    'followerCheck': function(userid) {
        return followingList.indexOf(userid) != -1;
    },
    'guest': function(current) {
        var userID = current.userID;

        if (GS.getCurrentBroadcast().getPermissionsForUserID(userID) != undefined) // is guest
            GS.Services.SWF.broadcastRemoveVIPUser(userID);
        else
            GS.Services.SWF.broadcastAddVIPUser(userID, 0, 63); // 63 seems to be the permission mask
    },
    'guestCheck': function(userid) {
        if (!GU.isGuesting(userid)) {
            GU.sendMsg('Only Guests can use that feature, sorry!');
            return false;
        }
        return true;
    },
    'guestOrWhite': function(userid) {
        return (GU.isGuesting(userid) || GU.whiteListCheck(userid));
    },
    'inListCheck': function(userid, list) {
        return list.split(',').indexOf("" + userid) != -1;
    },
    'isGuesting': function(userid) {
        return GS.getCurrentBroadcast().attributes.vipUsers.some(function(elem) {
            return elem.userID == userid;
        });
    },
    'makeGuest': function(current, guestID) {
        guestID = Number(guestID);
        if (!isNaN(guestID))
            GS.Services.SWF.broadcastAddVIPUser(guestID, 0, 63); // 63 seems to be the permission mask
    },
    'ownerCheck': function(userid) {
        if (userid != GS.getCurrentBroadcast().attributes.UserID) {
            GU.sendMsg('Only the Master can use that feature, sorry!');
            return false;
        }
        return true;
    },
    'strictWhiteListCheck': function(userid) {
        if (GU.inListCheck(userid, GUParams.whitelist))
            return true;
        GU.sendMsg('Only user that are explicitly in the whitelist can use this feature, sorry!');
        return false;
    },
    'unGuest': function(current, parameter) {
        if (parameter == undefined) {
            return;
        }
        if (parameter.toUpperCase() == 'ALL') {
            GS.getCurrentBroadcast().attributes.publishersUsersIDs.forEach(function(guestID) {
                GS.Services.SWF.broadcastRemoveVIPUser(guestID);
            });
        } else {
            if (isNaN(parameter)){
                GU.sendMsg(parameter.toString() + " is not a valid guestID.")
            } else {
            if (!GU.isGuesting(parameter)) {
                GS.Models.User.get(parameter).then(function(u){
                    uName = u.get('Name');
                    if (uName == undefined){
                        GU.sendMsg(parameter.toString() + " is not a valid ID.")
                    }
                    GU.sendMsg(uName + ' is not a Guest, sorry!');
                })
                return false;
            } else {
                GS.Services.SWF.broadcastRemoveVIPUser(parameter);
            }                
            }
        }
    },
    'updateFollowing': function() {
        GS.Services.API.userGetFollowersFollowing().then(
            function(alluser) {
                followingList = [];
                alluser.forEach(function(single) {
                    if (single.IsFavorite === '1') {
                        followingList.push(parseInt(single.UserID));
                    }
                });
            });
    },
    'whiteListCheck': function(userid) {
        if (GU.inListCheck(userid, GUParams.whitelist)) // user in whitelist
        {
            return true;
        } else if (GUParams.whitelistIncludesFollowing.toString() === 'true' && !GU.inListCheck(userid, GUParams.blacklist) && GU.followerCheck(userid)) {
            return true;
        }
        //GU.sendMsg('Only ' + GUParams.whiteListName + ' can use that feature, sorry!');
        return false;
    },



    /* 
     * Queue functions
     */
    'addSongToHistory': function() {
        if (Grooveshark.getCurrentSongStatus().song == null)
            return;
        var currSongID = Grooveshark.getCurrentSongStatus().song.songID;
        if (lastPlayedSongs.length == 0 || lastPlayedSongs[lastPlayedSongs.length - 1] != currSongID) {
            var posToRemove = lastPlayedSongs.indexOf(currSongID);
            // Remove the song in the list
            if (posToRemove != -1)
                lastPlayedSongs.splice(posToRemove, 1);
            lastPlayedSongs.push(currSongID);
            // Remove the oldest song in the list if it goes over the limit.
            if (GUParams.historyLength < lastPlayedSongs.length)
                lastPlayedSongs.shift();
        }
    },
    'deletePlayedSong': function() {
        var previousSong;
        while (true) {
            previousSong = GS.Services.SWF.getCurrentQueue().previousSong;
            if (previousSong != null)
                GS.Services.SWF.removeSongs([previousSong.queueSongID]);
            else
                break;
        }
    },
    'fetchByName': function(message, stringFilter) {
        var songToPlay = GU.getMatchedSongsList(stringFilter);
        if (songToPlay.length > 0) {
            GS.Services.SWF.moveSongsTo([songToPlay[0].queueSongID], 1, true);
            var sName = songToPlay[0].SongName;
            GU.sendMsg("Fetched \"" + sName +"\".");
        } else {
            GU.sendMsg("Unable to find song title matching: \"" + stringFilter + "\".");
        }
    },
    'fetchLast': function(message, parameter) //@author: Flumble
    {
        var count = 1;
        var queue = GS.Services.SWF.getCurrentQueue();
        var nextIndex = queue.activeSong.index + 1;

        if (parameter && parseInt(parameter) > 0)
            count = parseInt(parameter);

        if (nextIndex < queue.songs.length - count) {
            var lastSongs = queue.songs.slice(-count);
            lastSongs = lastSongs.map(function(song) {
                return song.queueSongID;
            }); //'of course' GS wants the queueID instead of a reference

            GS.Services.SWF.moveSongsTo(lastSongs, nextIndex, true);
            GU.sendMsg(count.toString() + " song" + ((count > 1) ? "s" : "") + " fetched");
        } else {
            //notify the broadcaster that too many songs were selected to play next
            if (nextIndex == queue.songs.length - count)
                GU.sendMsg((count == 1) ? "That IS the next song, silly" : "Those ARE the next songs, silly");
            else
                GU.sendMsg("Too many songs selected");
        }
    },
    'forcePlay': function() {
        if (Grooveshark.getCurrentSongStatus().status != 'playing') {
            if (new Date() - lastPlay > 4000 && !forcePlay) {
                forcePlay = true;
                Grooveshark.play();
            }
            if (new Date() - lastPlay > 8000) {
                Grooveshark.removeCurrentSongFromQueue();
                forcePlay = false;
                lastPlay = new Date();
            }
        } else {
            forcePlay = false;
            lastPlay = new Date();
        }
    },
    'getMatchedSongsList': function(stringFilter) {
        var regex = RegExp(stringFilter, 'i');
        var songs = GU.getPlaylistNextSongs();
        var listToRemove = [];
        songs.forEach(function(element) {
            if (regex.test(element.AlbumName) ||
                // regex.test(element.ArtistName) ||
                regex.test(element.SongName))
                listToRemove.push(element);
        });
        return listToRemove;
    },
    'getPlaylist': function(message, parameter) {
        var playlistID = parameter;
        var playlistName = "";
        var playlistUser = "";
        var playlistUserId = "";
        var playlistCount = "";
        var msgUpdate = "";
        GS.Models.Playlist.get(playlistID).then(function(p) {
                //not run if does not exist
                playlistName = p.get('PlaylistName');
                playlistCount = p.get('SongCount');
                playlistUser = p.get('UserName');
                playlistUserId = p.get('UserID');
                msgUpdate = "Playlist: \"" + playlistName + "\" By: \"" + playlistUser + "\", " + playlistCount + " songs added."
                Grooveshark.addPlaylistByID(playlistID);
            }, // if it fails...
            function() {
                msgUpdate = "Unable to find a playlist with ID: \"" + playlistID + "\"."
            })
            .always(function() {
                GU.sendMsg(msgUpdate)
            });
    },
    'getPlaylistNextSongs': function() {
        var songs = GS.Services.SWF.getCurrentQueue().songs;
        var index = GS.Services.SWF.getCurrentQueue().activeSong.queueSongID;
        while (songs[0] != null && songs[0].queueSongID <= index) {
            songs.shift();
        }
        return songs;
    },
    'playPlaylist': function(message, playlistId) {
        GU.openSidePanel();
        var playlistToPlay = $('#sidebar-playlists-grid').find('.sidebar-playlist')[playlistId];
        if (playlistToPlay == null) {
            GU.sendMsg('Cannot find playlist: ' + playlistId);
        } else {
            var playlistId = $(playlistToPlay).children(0).attr('data-playlist-id');
            Grooveshark.addPlaylistByID(playlistId);
            GU.sendMsg('Playlist \'' + $(playlistToPlay).find('.name').text() + '\' added to the queue.');
        }
    },
    'playRandomSong': function() {
        playingRandom = true;
        var nextSong = allSongsId[Math.floor(Math.random() * allSongsId.length)];
        if (nextSong != undefined) {
            var nextSongIndex = lastPlayedSongs.indexOf(nextSong);
            var maxTry = 5;
            while (nextSongIndex != -1 && maxTry-- > 0) {
                var tmpSong = allSongsId[Math.floor(Math.random() * allSongsId.length)];
                if (tmpSong != undefined) {
                    var tmpIndex = lastPlayedSongs.indexOf(tmpSong);
                    if (tmpIndex < nextSongIndex)
                        nextSong = tmpSong;
                }
            }
            Grooveshark.addSongsByID([nextSong]);
        }
    },
    'previewSongs': function(msg, parameter) {
        var nbr = parseInt(parameter);
        if (nbr <= 0 || isNaN(nbr))
            nbr = GUParams.defaultSongPreview;
        if (nbr > GUParams.maxSongPreview)
            nbr = GUParams.maxSongPreview;
        songs = GU.getPlaylistNextSongs();

        var i = -1;
        var string = '';
        while (++i <= nbr) {
            var curr = songs[i];
            if (curr == null)
                break;
            string = string + '#' + i + ': \"' + curr.SongName + '\"" By: \"' + curr.ArtistName + "\"" + GUParams.separator;
        }
        GU.sendMsg('Next songs are: ' + string.substring(0, string.length - GUParams.separator.length));
    },
    'showPlaylist': function(message, stringFilter) {
        GU.openSidePanel();
        var string = '';
        var regex = RegExp(stringFilter, 'i');
        $('#sidebar-playlists-grid').find('.sidebar-playlist').each(function() {
            var playlistName = $(this).find('.name').text();
            if (regex.test(playlistName))
                string = string + '#' + $(this).index() + ': ' + playlistName + GUParams.separator;
        });
        if (string == '')
            string = 'No match found for ' + stringFilter;
        else
            string = 'Playlist matched:' + string.substring(0, string.length - GUParams.separator.length);
        GU.sendMsg(string);
    },
    'skip': function() {
        Grooveshark.removeCurrentSongFromQueue();
    },
    'songInQueue': function() {
        return $('#queue-num-total').text() - $('#queue-num').text();
    },
    'removeNextSong': function() {
        var nextSong = GS.Services.SWF.getCurrentQueue().nextSong;
        if (nextSong != null) {
            GS.Services.SWF.removeSongs([nextSong.queueSongID]);
        }
    },
    'removeLastSong': function(message, numberStr) {
        var songs = GS.Services.SWF.getCurrentQueue().songs;
        var allID = [];
        var number = Math.floor(Number(numberStr));
        if (isNaN(number) || number < 1)
            number = 1;
        while (--number >= 0) {
            if (songs.length - 1 - number >= 0) {
                var id = songs[songs.length - 1 - number].queueSongID;
                if (id != GS.Services.SWF.getCurrentQueue().activeSong.queueSongID)
                    allID.push(id);
            }
        }
        if (allID.length > 0) {
            GS.Services.SWF.removeSongs(allID);
        }
    },
    'previewRemoveByName': function(message, stringFilter) {
        var listToRemove = GU.getMatchedSongsList(stringFilter);
        if (listToRemove.length > 10 || listToRemove.length == 0)
            GU.sendMsg('' + listToRemove.length + 'Songs matched.');
        else {
            var string = 'Song matched: ';
            listToRemove.forEach(function(element) {
                string = string + element.SongName + ' ~ From: ' + element.AlbumName + GUParams.separator;
            });
            GU.sendMsg(string.substring(0, string.length - GUParams.separator.length));
        }
    },
    'removeByName': function(message, stringFilter) {
        //adding safeguard so that '/removeByName allSongs' must be typed to clear the queue.
        if (stringFilter == undefined) {
            GU.sendMsg("No songs were removed. Use \"/removeByName allSongs \" to clear the queue.");
            return;
        }
        if (stringFilter == "allSongs") {
            stringFilter = "";
        }
        var listToRemove = GU.getMatchedSongsList(stringFilter);
        var idToRemove = [];
        listToRemove.forEach(function(element) {
            idToRemove.push(element.queueSongID);
        });
        GS.Services.SWF.removeSongs(idToRemove);
        GU.sendMsg('Removed ' + idToRemove.length + ' songs.');
    },
    'shuffle': function() {
        $('.shuffle').click();
        GU.sendMsg('The queue has been shuffled!');
    },

    
    
    
    /* 
     * Collection functions
     */
    'addToCollection': function() {
        Grooveshark.addCurrentSongToLibrary();
        GU.sendMsg('Song added to the favorite.');
    },
    'removeFromCollection': function() {
        var currSong = Grooveshark.getCurrentSongStatus().song
        GS.Services.API.userRemoveSongsFromLibrary(GS.getLoggedInUserID(), currSong.songID, currSong.albumID, currSong.artistID).then(function() {
            GU.sendMsg('Song removed from the favorite.');
        });
    },



    /* 
     * Chat functions
     */
    'about': function() {
        GU.sendMsg('This broadcast is currently running "EGSA Broadcast Bot" v' + GUParams.version + ', created by grooveshark.com/karb0n13 . GitHub: http://goo.gl/UPGkO5 Forked From: http://goo.gl/vWM41J');
    },
    'ask': function(current, parameter) {
        var rng = 0;
        var uName = GU.getUserName(current.userID);
        var respText = '';
        if (parameter == undefined){
            return;
        }
        var answers = [
            'Concentrate and ask again',
            'Hell no.',
            'Yes',
            'As I see it, yes',
            'Signs point to yes',
            'It is decidedly so',
            'Very doubtful',
            'Cannot predict now',
            'All signs point to me not giving a chainsaw.',
            'Ask the Internet.',
            'Without a doubt',
            'Ask your mom.',
            'Yes definitely',
            'Of course, sweetie',
            'YES! Definitely. maybe...',
            'Don\'t count on it',
            'My reply is no',
            'Yes, yes, yes!',
            'The answer is yes if you kiss me first (づ ￣ 3 ￣)づ',
            'Most likely',
            'You may rely on it',
            'Dafuq?',
            'It is certain',
            'No',
            'LOL',
            'As many other things, that\'s a secret',
            'Ask again later',
            'Do I wear panties?',
            'Sorry, I wasn\'t listening.',
            'Reply hazy try again',
            'Please seek professional help.',
            'IDGAC',
            'Do you really need to ask?',
            'My sources say no',
            'Sadly, yes.',
            'Better not tell you now',
            'Not in a million years'
        ]
        if (rng == 0){
            var c = 0
            rng = Math.floor((Math.random() * 100) + 1);
            while ((rng > (answers.length + 1)) || (c == 10)) {
                rng = Math.floor((Math.random() * 100) + 1);
                c = c++;
            }
            if (rng > (answers.length + 1)) {
                rng = Math.floor((Math.random() * (answers.length)) + 1);
            }
        }
        respText = '@' + uName + ", " + answers[rng];
        GU.sendMsg(respText);
    },
    'doParseMessage': function(current) {
        var string = current.data;
        var regexp = RegExp('^/([A-z0-9]*)([ ]+(.+))?$'); // @author: karb0n13
        var regResult = regexp.exec(string);
        if (regResult != null) {
            var currentAction = actionTable[regResult[1]];
            if (currentAction instanceof Array && currentAction[0].every(function(element) {
                return element(current.userID);
            }))
                currentAction[1](current, regResult[3]);
            if (GU.guestOrWhite(current.userID)) {
                var currentAction = adminActions[regResult[1]];
                if (currentAction instanceof Array && currentAction[0].every(function(element) {
                    return element(current.userID);
                }))
                    currentAction[1](current, regResult[3]);
            }
        }
    },
    'doSalute' : function(current) {
        if (current.extra.n == undefined) {
            return;
        }
        
        var user = current.extra.n;

        if (Object.keys(alreadySaluted).length > 0) {
            for (var k in alreadySaluted) {
                if (alreadySaluted[k] == user) {
                    return;
                }
            }
        }

        GU.sendMsg('Hi ' + user + '! (づ ￣ 3 ￣)づ ♥');
        alreadySaluted[Object.keys(alreadySaluted).length] = user;
    },
    'getUserName': function(uID){
        var uName = '';
        GS.Models.User.get(uID).then(function(u){
            uName = u.get('Name');
        })
        return uName;
    },
    'getUserID' : function(uName) {
        var uID = 0;

        if (uName != undefined) {
            GS.getCurrentBroadcast().attributes.listeners.models.some(function(elem) {
                if (elem.attributes.Name == uName) {
                    uID = elem.attributes.UserID;
                }
            });
        }

        return uID;
    },
    'help': function(message, parameter) {
        if (parameter != undefined) {
            var currentAction = actionTable[parameter];
            if (currentAction instanceof Array) {
                GU.sendMsg('Help: /' + parameter + ' ' + currentAction[2]);
                return;
            }
        }
        var helpMsg = 'Command available:';
        Object.keys(actionTable).forEach(function(actionName) {
            helpMsg = helpMsg + ' ' + actionName;
        });
        helpMsg = helpMsg + '. Type /help [command name] for in depth help.';
        GU.sendMsg(helpMsg);

        //if user is a guest then show these:
        var isAdmin = GU.guestOrWhite(message.userID);
        if (isAdmin) {
            helpMsg = 'Admin commands:'
            if (parameter != undefined) {
                var currentAction = adminActions[parameter];
                if (currentAction instanceof Array) {
                    GU.sendMsg('Help: /' + parameter + ' ' + currentAction[2]);
                    return;
                }
            }
            Object.keys(adminActions).forEach(function(actionName) {
                helpMsg = helpMsg + ' ' + actionName;
            });
            GU.sendMsg(helpMsg);
        }
    },
    'isListening': function(user){
        if (isNaN(user)) {
            return GS.getCurrentBroadcast().attributes.listeners.models.some(function(elem) {
                return elem.attributes.Name == user;
            });
        } else {
            return GS.getCurrentBroadcast().attributes.listeners.models.some(function(elem) {
                return elem.attributes.UserID == user;
            });
        }
    },
    'ping': function(current) {
        GU.sendMsg('Pong!');
    },
    'removeMsg': function() {
        $('.chat-message').addClass('parsed');
    },
    'rules': function() //Original Author: davpat, modified to prevent floods.
    {
        var ruleslist = GUParams.rules.split(',');
        var msgDelay = 0;
        var loopTick = 0;
        var msg = "";
        for (i = 0; i < ruleslist.length; i++) {
            if (ruleslist[i] != "") {
                msg = ruleslist[i];
                msgDelay = loopTick * 1000;
                setTimeout(GU.sendMsg, msgDelay, msg);
                loopTick = loopTick + 1;
            }
        }
    },
    'roll': function(current, parameter) // Author: Deku
    {
        var uName = "";
        var uID = current.userID;
        GS.Models.User.get(uID).then(function(u) {
            uName = u.get('Name');
        })
        var min = 1;
        var max = 100;

        if (parameter == undefined) {
            parameter = "100"; // If no parameter is given, roll from 1 to 100
        }
        if (isNaN(parseInt(parameter))) {
            GU.sendMsg("How do you expect me to roll " + parameter + "?");
            return;
        } else {
            var number = parseInt(parameter);
            max = number;
            if (number > 2 && number < 10001) {
                var roll = Math.floor(Math.random() * max) + min;
                GU.sendMsg("[Roll: " + min + " - " + max + " ] Grace Bot summons a magical dice. " 
                    + uName + " throws it and gets a " + roll 
                    + (roll > 9000 ? ". It's over 9000!" : "."));
            } else {
                // 0 or negative number
                if (number <= 0) {
                    GU.sendMsg("I am sorry, but it is impossible to create an object with fewer than 2 sides.");
                }
                // 1 gets a message ...
                if (number == 1) {
                    GU.sendMsg("A one sided dice? Really? ok....");
                    GU.sendMsg("[Roll] " + uName + " rolled a 1.. are you happy now?");
                }
                // For 2 sides we use a coin
                if (number == 2) {
                    var flip = Math.floor(Math.random() * max) + min;
                    var coin = "";
                    switch (flip) {
                        case 1:
                            coin = "Heads";
                            break;
                        case 2:
                            coin = "Tails";
                            break;
                    }
                    GU.sendMsg("[Roll] Grace Bot flips a coin. The coin lands on " + coin + "!");
                }
                // Avoid using big number, because it gets out of the chat window
                if (number >= 10001) {
                    GU.sendMsg("I am sorry, I don't have enough power to summon a " + number + " sided dice.");
                }
            }
        }
    },
    'sendMsg': function(msg) {
        var broadcast = GS.getCurrentBroadcast();
        if (broadcast === false)
            return;

        var maxMsgLength = 256; // the max number of caracters that can go in the gs chat
        var index = 0;

        while ((Math.floor(msg.length / maxMsgLength) + (msg.length % maxMsgLength != 0)) >= ++index) {
            broadcast.sendChatMessage(msg.substr((index - 1) * maxMsgLength, maxMsgLength));
        }
    },
    'whoamI': function(current){
        var uName = GU.getUserName(current.userID);
        GU.sendMsg('You are:' + uName + '. Your ID is: ' + current.userID + '.');
    },
    
    

    /* 
     * RPG functions
     */
    'cast': function(current, parameter) {
        if (parameter == undefined) {
            GU.sendMsg('Puff!! Nothing happened.');
            return;
        }

        // Save first parameter. It could be a spell name or help request
        parameter = parameter.split(' ');
        var param1 = parameter[0];
        // Delete first parameter and take all what's left as second parameter (target)
        parameter[0] = null;
        parameter = parameter.join(' ');
        parameter = parameter.trim();
        var targetID = isNaN(parameter) && parameter != '' ? GU.getUserID(parameter) : parameter;
        var userID = current.userID;

        if (param1 == '-help') {
            var currentAction = actionTable['cast'];
            if (currentAction instanceof Array) {
                GU.sendMsg('Help: /cast ' + currentAction[2]);
            }
            return;
        }

        if (RPG.PlayerList[userID] == undefined || !RPG.PlayerList[userID].hasClass()) {
            GU.sendMsg('Hey kid! You know nothing about fighting! Go back to the Academy and choose a class.');
            return;
        }

        RPG.SpellManager.ExecuteSpell(param1, userID, targetID);
    },
    'class' : function(current, parameter) {
        var sender = current.userID;
        parameter = parameter.split(' ');
        var action = parameter[0];

        if (action == 'choose') {
            var newClass = parameter[1];
            RPG.PlayerManager.ModifyClass(sender, newClass);
            return;
        } else if (action == 'reset') {
            RPG.PlayerManager.ResetClass(sender); 
            return;
        } else if (action == 'list') {
            var classList = '';
            for (var i = 0; i <= RPG.Classes.length; i++) {
                classList += RPG.Classes[i] + ', ';
            }
            GU.sendMsg('Available classes are: ' + classList);
            return;
        }

        GU.sendMsg('Couldn\'t understand what you needed. Available actions are "choose", "reset" and "list".');
    }
};
adminActions = {
    'guest': [
        [GU.inBroadcast, GU.guestOrWhite], GU.guest, '- Toogle your guest status.'
    ],
    'makeGuest': [
        [GU.inBroadcast, GU.strictWhiteListCheck], GU.makeGuest, 'USERID - Force-guest a user with its ID.'
    ],
    'unGuest': [
        [GU.inBroadcast, GU.strictWhiteListCheck], GU.unGuest, 'USERID - Force-unguest a user with its ID.'
    ],
    'addToCollection': [
        [GU.inBroadcast, GU.strictWhiteListCheck], GU.addToCollection, '- Add this song to the collection.'
    ],
    'removeFromCollection': [
        [GU.inBroadcast, GU.strictWhiteListCheck], GU.removeFromCollection, '- Remove this song from the collection.'
    ],
        'removeNext': [
        [GU.inBroadcast, GU.guestCheck], GU.removeNextSong, '- Remove the next song in the queue.'
    ],
    'removeLast': [
        [GU.inBroadcast, GU.guestCheck], GU.removeLastSong, '[NUMBER] - Remove the last song of the queue.'
    ],
    'fetchByName': [
        [GU.inBroadcast, GU.guestCheck], GU.fetchByName, '[FILTER] - Place the first song of the queue that matches FILTER at the beginning of the queue.'
    ],
    'fetchLast': [
        [GU.inBroadcast, GU.guestCheck], GU.fetchLast, '- Bring the last song at the beginning of the queue.'
    ],
    'previewRemoveByName': [
        [GU.inBroadcast, GU.guestCheck], GU.previewRemoveByName, '[FILTER] - Get the list of songs that will be remove when calling \'removeByName\' with the same FILTER.'
    ],
    'removeByName': [
        [GU.inBroadcast, GU.guestCheck], GU.removeByName, '[FILTER] - Remove all songs that matches the filter. To clear queue use \'/removeByName allSongs\'. Use the \'previewRemoveByName\' first.'
    ],
    'showPlaylist': [
        [GU.inBroadcast, GU.guestCheck], GU.showPlaylist, '[FILTER] - Get the ID of a particular playlist.'
    ],
    'playPlaylist': [
        [GU.inBroadcast, GU.guestCheck], GU.playPlaylist, 'PLAYLISTID - Play the playlist from the ID given by \'showPlaylist\'.'
    ],
    'skip': [
        [GU.inBroadcast, GU.guestCheck], GU.skip, '- Skip the current song.'
    ],
    'shuffle': [
        [GU.inBroadcast, GU.guestCheck], GU.shuffle, '- Shuffle the current queue.'
    ],
    'peek': [
        [GU.inBroadcast, GU.guestOrWhite], GU.previewSongs, '[NUMBER] - Preview the songs that are in the queue.'
    ],
    'getPlaylist': [
        [GU.inBroadcast, GU.guestCheck], GU.getPlaylist, '[NUMBER] - Universal Playlist Loader. Usage: /getPlaylist [Playlist ID], see: http://goo.gl/46OwkC'
    ],
};
actionTable = {
    'help': [
        [GU.inBroadcast], GU.help, '- Display this help.'
    ],
    'ping': [
        [GU.inBroadcast], GU.ping, '- Ping the BOT.'
    ],
    'whoamI': [
        [GU.inBroadcast], GU.whoamI, '- Return User Name & ID.'
    ],
    'ask': [
        [GU.inBroadcast], GU.ask, '[QUESTION] - Grace will answer a Yes or No question.'
    ],
    'rules': [
        [GU.inBroadcast], GU.rules, '- Rules of the broadcast'
    ],
    'roll': [
        [GU.inBroadcast], GU.roll, '[NUMBER] - Test your luck throwing the magical dice. If no number of sides is given, the dice will roll from 1-100'
    ],
    'cast': [
        [GU.inBroadcast], GU.cast, '[SPELL] [TARGET]- (Work In Progress) Simple roleplaying command. Current spells are: fireball, arcanemissiles, frostbolt, corruption, drainlife, deathcoil, searingpain, dongerstrike, sexiness'
    ],
    'about': [
        [GU.inBroadcast], GU.about, '- EGSA Broadcaster Bot - RPG Version: Codename "Grace".'
    ],
    'class': [
        [GU.inBroadcast], GU.class, '- Class management command. Available actions are: choose, reset and list.'
    ]
};

(function() {
    var callback_start = function() {
        onbeforeunload = null;
        if (GUParams.userReq != '' && GUParams.passReq != '') {
            GS.Services.API.logoutUser().then(function() {
                GS.Services.API.authenticateUser(GUParams.userReq, GUParams.passReq).then(function(user) {
                    window.location = "http://broadcast-nologin/";
                });
            });
        } else
            GU.broadcast();
    }
    var init_check = function() {
        try {
            GS.ready.done(callback_start);
        } catch (e) {
            setTimeout(init_check, 100);
        }
    }
    init_check();
})()